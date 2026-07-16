import { useState } from "react";
import { FolderGit2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { PullRequestSummary, RecentCommit, RefExpr, Worktree } from "@shared/schemas";
import { useCreateDiff } from "@/hooks/diffs/useDiffs";
import { useRepos } from "@/hooks/repos/useRepos";
import { useRepoBranches } from "@/hooks/repos/useRepoBranches";
import { useRecentCommits } from "@/hooks/repos/useRecentCommits";
import { useWorktrees } from "@/hooks/repos/useWorktrees";
import {
  useCreateDiffFromPullRequest,
  useGhReadiness,
  usePullRequests,
} from "@/hooks/gh/usePullRequests";
import { ModalShell } from "@/components/ui/modal-shell";
import { Badge } from "./ui/badge";
import { BranchCombobox } from "./ui/branch-combobox";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/form-controls";
import { Segmented } from "./ui/segmented";
import { Skeleton } from "./ui/skeleton";
import { WorktreeCombobox } from "./ui/worktree-combobox";
import { diffTitle, worktreeForPullRequest } from "@shared/refExpr";
import { tildify } from "@/lib/projectPaths";
import { cn, focusRing } from "@/lib/utils";
import { notify } from "@/lib/toast";

type Source = "refs" | "pullRequest";

type LeafKind = "branch" | "commit" | "head" | "workingTree";
type FormLeaf =
  | { kind: "branch"; name: string }
  | { kind: "commit"; hash: string }
  | { kind: "head" }
  | { kind: "workingTree" };
type FormRef = FormLeaf | { kind: "mergeBase"; a: FormLeaf; b: FormLeaf };

const emptyLeaf: FormLeaf = { kind: "branch", name: "" };

function formLeafToRef(leaf: FormLeaf): RefExpr | null {
  switch (leaf.kind) {
    case "branch":
      return leaf.name.trim() ? { kind: "branch", name: leaf.name.trim() } : null;
    case "commit":
      return leaf.hash.trim() ? { kind: "commit", hash: leaf.hash.trim() } : null;
    case "head":
      return { kind: "head" };
    case "workingTree":
      return { kind: "workingTree" };
  }
}

function formToRef(form: FormRef): RefExpr | null {
  if (form.kind === "mergeBase") {
    const a = formLeafToRef(form.a);
    const b = formLeafToRef(form.b);
    if (!a || !b) return null;
    return { kind: "mergeBase", a, b };
  }
  return formLeafToRef(form);
}

export function NewDiffDialog({
  initialRepoId,
  onClose,
}: {
  initialRepoId: string;
  onClose: () => void;
}) {
  const repo = (useRepos().data ?? []).find((r) => r.id === initialRepoId) ?? null;
  // PR review is the primary flow: repos with a GitHub remote land on
  // the Pull request tab; everything else starts on Refs. An explicit
  // tab pick always wins.
  const [pickedSource, setPickedSource] = useState<Source | null>(null);
  const source: Source =
    pickedSource ?? (repo?.remoteUrl?.includes("github") ? "pullRequest" : "refs");

  return (
    <ModalShell onClose={onClose} popoverClassName="w-[95vw] max-w-[1200px] h-[82vh]">
      <div className="flex h-full flex-col">
        {/* Title row */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-7 py-4">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">New diff</h2>
            <span className="truncate text-sm text-muted-foreground">
              in <span className="font-medium text-foreground">{repo?.name ?? initialRepoId}</span>
            </span>
          </div>
          <Segmented
            label="Diff source"
            value={source}
            onChange={setPickedSource}
            size="md"
            options={[
              { value: "pullRequest", label: "Pull request" },
              { value: "refs", label: "Refs" },
            ]}
          />
        </div>

        {/* Body: flex column that splits scroll area from the submit bar */}
        <div className="flex min-h-0 flex-1 flex-col">
          {source === "refs" ? (
            <RefsMode repoId={initialRepoId} onClose={onClose} />
          ) : (
            <PullRequestMode repoId={initialRepoId} onClose={onClose} />
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function RefsMode({ repoId, onClose }: { repoId: string; onClose: () => void }) {
  // Eager-fetch the branch list so BranchCombobox is warm when the user
  // opens it. The combobox calls the same hook internally; React Query
  // dedupes.
  useRepoBranches(repoId || null);
  const recentCommits = useRecentCommits(repoId || null);
  const worktrees = useWorktrees(repoId || null);
  const [worktreePath, setWorktreePath] = useState<string>("");
  const [left, setLeft] = useState<FormRef>(emptyLeaf);
  const [right, setRight] = useState<FormRef>(emptyLeaf);
  const [name, setName] = useState<string>("");

  // Reset the pickers when the target repo changes. Adjusted during
  // render (react.dev "adjusting state when a prop changes") instead of
  // in an effect, so a stale frame for the old repo never commits.
  const [prevRepoId, setPrevRepoId] = useState(repoId);
  if (prevRepoId !== repoId) {
    setPrevRepoId(repoId);
    setWorktreePath("");
    setLeft(emptyLeaf);
    setRight(emptyLeaf);
  }

  // Seed the worktree picker with the main worktree once the list
  // loads. Render-time adjustment, same convergence as the reset above:
  // it only fires while the picker is still unset.
  if (worktreePath === "" && worktrees.data) {
    const main = worktrees.data.find((w) => w.isMain) ?? worktrees.data[0];
    if (main) setWorktreePath(main.path);
  }

  const selectedWorktree = worktrees.data?.find((w) => w.path === worktreePath) ?? null;

  // Seed untouched endpoints when the selected worktree changes: left
  // defaults to its checked-out branch, right to the working tree. Gated
  // on the worktree change (not the leaves being blank) so the user can
  // still pick "Branch" or clear a branch afterwards without the seed
  // snapping their edit back.
  const [prevWorktree, setPrevWorktree] = useState<Worktree | null>(null);
  if (prevWorktree !== selectedWorktree) {
    setPrevWorktree(selectedWorktree);
    if (selectedWorktree) {
      if (left.kind === "branch" && left.name === "" && selectedWorktree.branch) {
        setLeft({ kind: "branch", name: selectedWorktree.branch });
      }
      if (right.kind === "branch" && right.name === "") {
        setRight({ kind: "workingTree" });
      }
    }
  }

  const leftRef = formToRef(left);
  const rightRef = formToRef(right);

  const create = useCreateDiff();
  const navigate = useNavigate();
  const submit = async () => {
    if (!repoId || !leftRef || !rightRef) return;
    const trimmedName = name.trim();
    const carryWorktree = selectedWorktree && !selectedWorktree.isMain;
    const created = await create.mutateAsync({
      repoId,
      left: leftRef,
      right: rightRef,
      ...(trimmedName.length > 0 ? { name: trimmedName } : {}),
      ...(carryWorktree && selectedWorktree ? { rightWorktreePath: selectedWorktree.path } : {}),
    });
    notify("Diff created", created.name);
    onClose();
    void navigate({
      to: "/repos/$repoId/diffs/$diffId",
      params: { repoId: created.repoId, diffId: created.id },
    });
  };

  const onPickWorktree = (path: string) => {
    setWorktreePath(path);
    // Clearing left/right lets the seeding effect re-fill them from the
    // newly-chosen worktree's currentBranch / workingTree.
    setLeft(emptyLeaf);
    setRight(emptyLeaf);
  };

  const canSubmit = repoId !== "" && leftRef !== null && rightRef !== null;
  const previewName = name.trim() || (leftRef && rightRef ? diffTitle(leftRef, rightRef) : "");
  const recents = recentCommits.data ?? [];
  const worktreeList = worktrees.data ?? [];

  return (
    <>
      {/* Scrolling form area */}
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        <div className="flex flex-col gap-7">
          {/* The two endpoints sit side by side. Reviewing leads on the
              left because it is the side the user is actually examining;
              Compared against is the baseline reference. */}
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            <SectionBlock title="Compared against" subhead="the left side, the baseline">
              <ComparedAgainstPicker
                repoId={repoId}
                value={left}
                onChange={setLeft}
                worktree={selectedWorktree}
                recentCommits={recents}
              />
            </SectionBlock>
            <SectionBlock title="Reviewing" subhead="the right side, what you examine">
              <WorktreeCombobox
                worktrees={worktreeList}
                selectedPath={worktreePath}
                onChange={onPickWorktree}
              />
              <ReviewingPicker
                repoId={repoId}
                value={right}
                onChange={setRight}
                worktree={selectedWorktree}
                recentCommits={recents}
              />
              <p className="text-xs leading-relaxed text-muted-foreground/80">
                PReviewer reads the worktree as it is right now. It never runs git checkout, so
                opening this diff later won't disturb whatever you have checked out.
              </p>
            </SectionBlock>
          </div>

          <Field label="Name (optional)">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={previewName || "auto"}
            />
          </Field>
        </div>
      </div>

      {/* Submit bar pinned to modal bottom. Stays visible regardless of
          the form's natural height so the modal reads as a real dialog
          with a primary action at the bottom-right. */}
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/60 bg-popover px-7 py-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="default"
          onClick={() => void submit()}
          disabled={!canSubmit || create.isPending}
        >
          {create.isPending ? "Creating…" : "Create diff"}
        </Button>
      </div>
    </>
  );
}

function SectionBlock({
  title,
  subhead,
  children,
}: {
  title: string;
  subhead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        <span className="text-sm text-muted-foreground/80">{subhead}</span>
      </div>
      {children}
    </section>
  );
}

function worktreeName(wt: Worktree): string {
  const last = wt.path.split("/").filter(Boolean).pop();
  return last ?? wt.path;
}

function ReviewingPicker({
  repoId,
  value,
  onChange,
  worktree,
  recentCommits,
}: {
  repoId: string;
  value: FormRef;
  onChange: (next: FormRef) => void;
  worktree: Worktree | null;
  recentCommits: RecentCommit[];
}) {
  // The right side cannot be a merge base.
  const leaf: FormLeaf = value.kind === "mergeBase" ? emptyLeaf : value;
  return (
    <div className="flex flex-col gap-2">
      <Segmented
        label="Reviewing kind"
        value={leaf.kind}
        onChange={(next) => onChange(leafFromKind(next))}
        size="md"
        options={[
          { value: "workingTree", label: "Working tree" },
          { value: "head", label: "HEAD" },
          { value: "branch", label: "Branch" },
          { value: "commit", label: "Commit" },
        ]}
      />
      <ValueRow>
        {leaf.kind === "workingTree" ? (
          worktree ? (
            <ResolvedHint>
              Working tree of <Mono>{tildify(worktree.path)}</Mono>
              {worktree.branch ? (
                <>
                  , currently on <Mono>{worktree.branch}</Mono>
                </>
              ) : null}
            </ResolvedHint>
          ) : (
            <ResolvedHint muted>Pick a worktree above.</ResolvedHint>
          )
        ) : leaf.kind === "head" ? (
          worktree ? (
            <ResolvedHint>
              HEAD of <Mono>{worktree.branch ?? `${worktree.head.slice(0, 7)} (detached)`}</Mono>{" "}
              <span className="text-muted-foreground/60">in {worktreeName(worktree)}</span>
            </ResolvedHint>
          ) : (
            <ResolvedHint muted>Pick a worktree above.</ResolvedHint>
          )
        ) : leaf.kind === "branch" ? (
          <BranchCombobox
            repoId={repoId}
            value={leaf.name}
            onChange={(name) => onChange({ kind: "branch", name })}
          />
        ) : (
          <CommitPicker
            value={leaf.hash}
            onChange={(hash) => onChange({ kind: "commit", hash })}
            recentCommits={recentCommits}
          />
        )}
      </ValueRow>
    </div>
  );
}

type ComparedKind = "branch" | "commit" | "head";

function ComparedAgainstPicker({
  repoId,
  value,
  onChange,
  worktree,
  recentCommits,
}: {
  repoId: string;
  value: FormRef;
  onChange: (next: FormRef) => void;
  worktree: Worktree | null;
  recentCommits: RecentCommit[];
}) {
  if (value.kind === "mergeBase") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
            Merge base of
          </span>
          <button
            type="button"
            onClick={() => onChange(emptyLeaf)}
            className={cn(
              "text-xs text-muted-foreground transition-colors hover:text-foreground",
              focusRing,
            )}
          >
            Cancel merge base
          </button>
        </div>
        <LeafPicker
          repoId={repoId}
          value={value.a}
          onChange={(a) => onChange({ kind: "mergeBase", a, b: value.b })}
          recentCommits={recentCommits}
        />
        <LeafPicker
          repoId={repoId}
          value={value.b}
          onChange={(b) => onChange({ kind: "mergeBase", a: value.a, b })}
          recentCommits={recentCommits}
        />
      </div>
    );
  }

  const kind: ComparedKind = value.kind === "workingTree" ? "branch" : value.kind;
  return (
    <div className="flex flex-col gap-2">
      <Segmented
        label="Compared against kind"
        value={kind}
        onChange={(next) => onChange(leafFromKind(next))}
        size="md"
        options={[
          { value: "branch", label: "Branch" },
          { value: "commit", label: "Commit" },
          { value: "head", label: "HEAD" },
        ]}
      />
      <ValueRow>
        {kind === "branch" ? (
          <BranchCombobox
            repoId={repoId}
            value={value.kind === "branch" ? value.name : ""}
            onChange={(name) => onChange({ kind: "branch", name })}
          />
        ) : kind === "commit" ? (
          <CommitPicker
            value={value.kind === "commit" ? value.hash : ""}
            onChange={(hash) => onChange({ kind: "commit", hash })}
            recentCommits={recentCommits}
          />
        ) : worktree ? (
          <ResolvedHint>
            HEAD of <Mono>{worktree.branch ?? `${worktree.head.slice(0, 7)} (detached)`}</Mono>{" "}
            <span className="text-muted-foreground/60">in {worktreeName(worktree)}</span>
          </ResolvedHint>
        ) : (
          <ResolvedHint muted>Pick a worktree on the left.</ResolvedHint>
        )}
      </ValueRow>
      <button
        type="button"
        onClick={() => onChange({ kind: "mergeBase", a: emptyLeaf, b: emptyLeaf })}
        className={cn(
          "self-start text-xs text-muted-foreground transition-colors hover:text-foreground",
          focusRing,
        )}
      >
        Compare against merge base…
      </button>
    </div>
  );
}

function ValueRow({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[36px] items-center gap-2">{children}</div>;
}

function ResolvedHint({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={cn("text-sm", muted ? "text-muted-foreground/60" : "text-muted-foreground")}>
      {children}
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-foreground">{children}</span>;
}

function PullRequestMode({ repoId, onClose }: { repoId: string; onClose: () => void }) {
  const readiness = useGhReadiness();
  const prs = usePullRequests(repoId || null);
  const worktrees = useWorktrees(repoId || null);
  const create = useCreateDiffFromPullRequest();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");

  // PRs whose head branch is already checked out in a worktree get a
  // chip and float to the top: reviewing those opens the live checkout
  // (editable, tracks the files on disk) rather than a frozen SHA.
  // worktreeForPullRequest is the same helper the main process binds
  // with, so the chip can never promise a live review the backend
  // won't give (notably: it excludes fork PRs).
  const checkoutFor = (pr: PullRequestSummary): Worktree | null =>
    worktreeForPullRequest(worktrees.data ?? [], pr);

  // React Compiler caches this computation; no manual useMemo needed.
  const all = prs.data ?? [];
  const needle = filter.trim().toLowerCase();
  const matched = needle
    ? all.filter(
        (pr) =>
          pr.title.toLowerCase().includes(needle) ||
          String(pr.number).includes(needle) ||
          pr.headRefName.toLowerCase().includes(needle),
      )
    : all;
  // Checked-out PRs first (stable within each group).
  const filtered = [...matched].sort(
    (a, b) => Number(checkoutFor(b) !== null) - Number(checkoutFor(a) !== null),
  );

  const onPick = (number: number) => {
    create.mutate(
      { repoId, number },
      {
        onSuccess: (diff) => {
          notify("Opening review", diff.name);
          onClose();
          void navigate({
            to: "/repos/$repoId/diffs/$diffId",
            params: { repoId: diff.repoId, diffId: diff.id },
          });
        },
      },
    );
  };

  // gh problems make the list unusable; show the remedy instead of an
  // empty shell that errors underneath.
  if (readiness.data && !readiness.data.installed) {
    return (
      <div className="px-7 py-6">
        <GhNotice>
          GitHub CLI (<code className="font-mono">gh</code>) isn't installed. Install with{" "}
          <code className="font-mono">brew install gh</code>, then reopen.
        </GhNotice>
      </div>
    );
  }
  if (readiness.data && !readiness.data.authed) {
    return (
      <div className="px-7 py-6">
        <GhNotice>
          GitHub CLI isn't signed in. Run <code className="font-mono">gh auth login</code>, then
          reopen.
        </GhNotice>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-7 py-6">
      <Input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Title, number, or branch"
        className="shrink-0"
      />

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card/30">
        {prs.isLoading ? (
          <ul className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex items-start gap-3 p-3">
                <Skeleton className="mt-0.5 h-5 w-12" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {prs.data?.length === 0
              ? "No pull requests for this repo."
              : "No PRs match the filter."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((pr) => {
              const checkout = checkoutFor(pr);
              return (
                <li key={pr.number}>
                  <button
                    type="button"
                    onClick={() => onPick(pr.number)}
                    disabled={create.isPending}
                    className="flex w-full items-start gap-3 p-3 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 disabled:cursor-wait disabled:opacity-50"
                  >
                    <Badge tone={stateTone(pr.state, pr.isDraft)} className="mt-0.5">
                      {pr.isDraft ? "Draft" : pr.state.toLowerCase()}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-baseline gap-2 text-sm">
                        <span className="tabular shrink-0 text-muted-foreground">#{pr.number}</span>
                        <span className="truncate font-medium">{pr.title}</span>
                        {checkout ? <CheckedOutChip worktree={checkout} /> : null}
                      </div>
                      <div className="truncate font-mono text-xs text-muted-foreground">
                        {pr.headRefName} → {pr.baseRefName}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="shrink-0 text-xs leading-relaxed text-muted-foreground/70">
        PRs already checked out in a worktree open as a live review of that checkout — edits write
        to disk and changes underneath you get flagged. Everything else reviews the PR's current
        head, frozen. PReviewer never checks anything out for you.
      </p>
    </div>
  );
}

function CheckedOutChip({ worktree }: { worktree: Worktree }) {
  const name = worktree.path.split("/").filter(Boolean).pop() ?? worktree.path;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300"
      title={`Checked out in ${worktree.path}. Reviewing opens the live working tree.`}
    >
      <FolderGit2 className="size-3 shrink-0" aria-hidden />
      <span className="font-medium">{worktree.isMain ? "main worktree" : name}</span>
    </span>
  );
}

function LeafPicker({
  repoId,
  value,
  onChange,
  recentCommits,
}: {
  repoId: string;
  value: FormLeaf;
  onChange: (next: FormLeaf) => void;
  recentCommits: RecentCommit[];
}) {
  return (
    <div className="flex gap-2">
      <Segmented
        label="Kind"
        value={value.kind}
        onChange={(next) => onChange(leafFromKind(next as LeafKind))}
        size="md"
        options={[
          { value: "branch", label: "Branch" },
          { value: "commit", label: "Commit" },
          { value: "head", label: "HEAD" },
          { value: "workingTree", label: "WT" },
        ]}
      />
      <div className="min-w-0 flex-1">
        {value.kind === "branch" ? (
          <BranchCombobox
            repoId={repoId}
            value={value.name}
            onChange={(name) => onChange({ kind: "branch", name })}
          />
        ) : value.kind === "commit" ? (
          <CommitPicker
            value={value.hash}
            onChange={(hash) => onChange({ kind: "commit", hash })}
            recentCommits={recentCommits}
          />
        ) : null}
      </div>
    </div>
  );
}

function CommitPicker({
  value,
  onChange,
  recentCommits,
}: {
  value: string;
  onChange: (next: string) => void;
  recentCommits: RecentCommit[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Commit hash"
        className="font-mono"
      />
      {recentCommits.length > 0 ? (
        <select
          value=""
          aria-label="Recent commits"
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          className={cn(
            "flex h-7 w-full min-w-0 rounded-md border border-input bg-background px-2 py-0.5 text-xs outline-none focus-visible:border-ring",
            focusRing,
          )}
        >
          <option value="">Recent commits…</option>
          {recentCommits.map((c) => (
            <option key={c.hash} value={c.hash}>
              {c.shortHash} {c.subject}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function leafFromKind(kind: LeafKind): FormLeaf {
  switch (kind) {
    case "branch":
      return { kind: "branch", name: "" };
    case "commit":
      return { kind: "commit", hash: "" };
    case "head":
      return { kind: "head" };
    case "workingTree":
      return { kind: "workingTree" };
  }
}

function stateTone(state: string, isDraft: boolean): "neutral" | "success" | "merged" | "danger" {
  if (isDraft) return "neutral";
  if (state === "OPEN") return "success";
  if (state === "MERGED") return "merged";
  return "danger";
}

function GhNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      {children}
    </div>
  );
}

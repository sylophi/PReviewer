import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { RecentCommit, RefExpr, Repo } from "@shared/schemas";
import { useCreateDiff } from "@/hooks/diffs/useDiffs";
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
import { Button } from "./ui/button";
import { Field, Input, Select } from "./ui/form-controls";
import { Segmented } from "./ui/segmented";
import { Skeleton } from "./ui/skeleton";
import { diffTitle } from "@/lib/refExpr";
import { tildify } from "@/lib/projectPaths";
import { notify } from "@/lib/toast";

interface NewDiffDialogProps {
  repos: Repo[];
  initialRepoId?: string;
  onClose: () => void;
}

type Source = "refs" | "pullRequest";

// Form-side mirror of RefExpr. Empty strings stand in for unfilled fields
// so the SidePicker is uncontrolled-friendly.
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

export function NewDiffDialog({ repos, initialRepoId, onClose }: NewDiffDialogProps) {
  const [repoId, setRepoId] = useState<string>(initialRepoId ?? repos[0]?.id ?? "");
  const [source, setSource] = useState<Source>("refs");

  return (
    <ModalShell onClose={onClose} popoverClassName="max-w-lg">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-medium">New diff</h2>
          <Segmented
            label="Diff source"
            value={source}
            onChange={setSource}
            options={[
              { value: "refs", label: "Refs" },
              { value: "pullRequest", label: "Pull request" },
            ]}
          />
        </div>

        {repos.length > 1 ? (
          <Field label="Repo">
            <Select value={repoId} onChange={(e) => setRepoId(e.target.value)}>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {source === "refs" ? (
          <RefsMode repoId={repoId} onClose={onClose} />
        ) : (
          <PullRequestMode repoId={repoId} onClose={onClose} />
        )}
      </div>
    </ModalShell>
  );
}

function RefsMode({ repoId, onClose }: { repoId: string; onClose: () => void }) {
  const branches = useRepoBranches(repoId || null);
  const recentCommits = useRecentCommits(repoId || null);
  const worktrees = useWorktrees(repoId || null);
  const [worktreePath, setWorktreePath] = useState<string>("");
  const [left, setLeft] = useState<FormRef>(emptyLeaf);
  const [right, setRight] = useState<FormRef>(emptyLeaf);
  const [name, setName] = useState<string>("");

  // Repo change: clear everything so the next set of seeding effects can
  // fire against fresh worktree / branch data.
  useEffect(() => {
    setWorktreePath("");
    setLeft(emptyLeaf);
    setRight(emptyLeaf);
  }, [repoId]);

  // Default to the main worktree as soon as the list resolves.
  useEffect(() => {
    if (!worktrees.data || worktreePath !== "") return;
    const main = worktrees.data.find((w) => w.isMain) ?? worktrees.data[0];
    if (main) setWorktreePath(main.path);
  }, [worktrees.data, worktreePath]);

  const selectedWorktree = useMemo(
    () => worktrees.data?.find((w) => w.path === worktreePath) ?? null,
    [worktrees.data, worktreePath],
  );

  // Seeding: left defaults to the chosen worktree's current branch (so
  // the diff reads as "uncommitted changes here" by default), right
  // defaults to the live working tree of that worktree.
  useEffect(() => {
    if (!selectedWorktree) return;
    setLeft((prev) => {
      if (prev.kind !== "branch" || prev.name !== "") return prev;
      return selectedWorktree.branch
        ? { kind: "branch", name: selectedWorktree.branch }
        : prev;
    });
    setRight((prev) => {
      if (prev.kind !== "branch" || prev.name !== "") return prev;
      return { kind: "workingTree" };
    });
  }, [selectedWorktree]);

  const leftRef = useMemo(() => formToRef(left), [left]);
  const rightRef = useMemo(() => formToRef(right), [right]);

  const create = useCreateDiff();
  const navigate = useNavigate();
  const submit = async () => {
    if (!repoId || !leftRef || !rightRef) return;
    const trimmedName = name.trim();
    // Only carry rightWorktreePath when it's a non-main worktree, so
    // single-worktree repos stay clean in the persisted JSON.
    const carryWorktree = selectedWorktree && !selectedWorktree.isMain;
    const created = await create.mutateAsync({
      repoId,
      left: leftRef,
      right: rightRef,
      ...(trimmedName.length > 0 ? { name: trimmedName } : {}),
      ...(carryWorktree && selectedWorktree
        ? { rightWorktreePath: selectedWorktree.path }
        : {}),
    });
    onClose();
    notify("Diff created", created.name);
    void navigate({
      to: "/repos/$repoId/diffs/$diffId",
      params: { repoId: created.repoId, diffId: created.id },
    });
  };

  const canSubmit = repoId !== "" && leftRef !== null && rightRef !== null;
  const previewName = name.trim() || (leftRef && rightRef ? diffTitle(leftRef, rightRef) : "");
  const localBranches = branches.data?.local ?? [];
  const recents = recentCommits.data ?? [];
  const worktreeList = worktrees.data ?? [];
  const hasMultipleWorktrees = worktreeList.length > 1;

  return (
    <>
      {hasMultipleWorktrees ? (
        <Field label="Worktree">
          <Select
            value={worktreePath}
            onChange={(e) => {
              setWorktreePath(e.target.value);
              // User switched worktree; clear left/right so seeding
              // picks the new worktree's currentBranch.
              setLeft(emptyLeaf);
              setRight(emptyLeaf);
            }}
          >
            {worktreeList.map((wt) => (
              <option key={wt.path} value={wt.path}>
                {worktreeLabel(wt)}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <SidePicker
        label="Left"
        value={left}
        onChange={setLeft}
        branches={localBranches}
        recentCommits={recents}
      />
      <SidePicker
        label="Right"
        value={right}
        onChange={setRight}
        branches={localBranches}
        recentCommits={recents}
      />

      <Field label="Name (optional)">
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={previewName || "auto"}
        />
      </Field>

      <div className="mt-2 flex items-center justify-end gap-2">
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

function worktreeLabel(wt: {
  path: string;
  branch: string | null;
  detached: boolean;
  head: string;
  isMain: boolean;
}): string {
  const state = wt.detached ? `(detached @ ${wt.head.slice(0, 7)})` : (wt.branch ?? "(unknown)");
  const tag = wt.isMain ? " · main" : "";
  return `${state} · ${tildify(wt.path)}${tag}`;
}

function PullRequestMode({ repoId, onClose }: { repoId: string; onClose: () => void }) {
  const readiness = useGhReadiness();
  const prs = usePullRequests(repoId || null);
  const create = useCreateDiffFromPullRequest();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const all = prs.data ?? [];
    const needle = filter.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (pr) =>
        pr.title.toLowerCase().includes(needle) ||
        String(pr.number).includes(needle) ||
        pr.headRefName.toLowerCase().includes(needle),
    );
  }, [prs.data, filter]);

  const onPick = (number: number) => {
    create.mutate(
      { repoId, number },
      {
        onSuccess: (diff) => {
          onClose();
          notify("Diff created", diff.name);
          void navigate({
            to: "/repos/$repoId/diffs/$diffId",
            params: { repoId: diff.repoId, diffId: diff.id },
          });
        },
      },
    );
  };

  return (
    <>
      {readiness.data && !readiness.data.installed ? (
        <GhNotice>
          GitHub CLI (<code className="font-mono">gh</code>) isn't installed. Install with{" "}
          <code className="font-mono">brew install gh</code>, then reopen.
        </GhNotice>
      ) : readiness.data && !readiness.data.authed ? (
        <GhNotice>
          GitHub CLI isn't signed in. Run <code className="font-mono">gh auth login</code>, then
          reopen.
        </GhNotice>
      ) : null}

      <Field label="Filter">
        <Input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Title, number, or branch"
        />
      </Field>

      <div className="max-h-72 overflow-auto rounded-lg border border-border bg-card/30">
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
            {filtered.map((pr) => (
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
                    <div className="truncate text-sm font-medium">
                      <span className="tabular text-muted-foreground">#{pr.number}</span>{" "}
                      <span className="text-muted-foreground/60">·</span> {pr.title}
                    </div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {pr.headRefName} → {pr.baseRefName}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </>
  );
}

interface SidePickerProps {
  label: string;
  value: FormRef;
  onChange: (next: FormRef) => void;
  branches: string[];
  recentCommits: RecentCommit[];
}

function SidePicker({ label, value, onChange, branches, recentCommits }: SidePickerProps) {
  const onKindChange = (next: FormRef["kind"]) => {
    if (next === "mergeBase") {
      onChange({ kind: "mergeBase", a: emptyLeaf, b: emptyLeaf });
    } else {
      onChange(leafFromKind(next));
    }
  };
  return (
    <Field label={label}>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Select
            value={value.kind}
            onChange={(e) => onKindChange(e.target.value as FormRef["kind"])}
            className="w-32 shrink-0"
          >
            <option value="branch">Branch</option>
            <option value="commit">Commit</option>
            <option value="head">HEAD</option>
            <option value="workingTree">Working tree</option>
            <option value="mergeBase">Merge base</option>
          </Select>
          {value.kind === "branch" ? (
            <BranchSelect
              value={value.name}
              onChange={(name) => onChange({ kind: "branch", name })}
              branches={branches}
            />
          ) : value.kind === "commit" ? (
            <CommitPicker
              value={value.hash}
              onChange={(hash) => onChange({ kind: "commit", hash })}
              recentCommits={recentCommits}
            />
          ) : null}
        </div>
        {value.kind === "mergeBase" ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-card/30 p-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
              Merge base of
            </div>
            <LeafPicker
              value={value.a}
              onChange={(a) => onChange({ kind: "mergeBase", a, b: value.b })}
              branches={branches}
              recentCommits={recentCommits}
            />
            <LeafPicker
              value={value.b}
              onChange={(b) => onChange({ kind: "mergeBase", a: value.a, b })}
              branches={branches}
              recentCommits={recentCommits}
            />
          </div>
        ) : null}
      </div>
    </Field>
  );
}

function LeafPicker({
  value,
  onChange,
  branches,
  recentCommits,
}: {
  value: FormLeaf;
  onChange: (next: FormLeaf) => void;
  branches: string[];
  recentCommits: RecentCommit[];
}) {
  return (
    <div className="flex gap-2">
      <Select
        value={value.kind}
        onChange={(e) => onChange(leafFromKind(e.target.value as LeafKind))}
        className="w-32 shrink-0"
      >
        <option value="branch">Branch</option>
        <option value="commit">Commit</option>
        <option value="head">HEAD</option>
        <option value="workingTree">Working tree</option>
      </Select>
      {value.kind === "branch" ? (
        <BranchSelect
          value={value.name}
          onChange={(name) => onChange({ kind: "branch", name })}
          branches={branches}
        />
      ) : value.kind === "commit" ? (
        <CommitPicker
          value={value.hash}
          onChange={(hash) => onChange({ kind: "commit", hash })}
          recentCommits={recentCommits}
        />
      ) : null}
    </div>
  );
}

function BranchSelect({
  value,
  onChange,
  branches,
}: {
  value: string;
  onChange: (next: string) => void;
  branches: string[];
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="flex-1">
      <option value="" disabled>
        Pick a branch…
      </option>
      {branches.map((b) => (
        <option key={b} value={b}>
          {b}
        </option>
      ))}
    </Select>
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
    <div className="flex flex-1 flex-col gap-1">
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Commit hash"
        className="font-mono"
      />
      {recentCommits.length > 0 ? (
        <Select
          value=""
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
          className="h-7 text-xs"
        >
          <option value="">Recent commits…</option>
          {recentCommits.map((c) => (
            <option key={c.hash} value={c.hash}>
              {c.shortHash} · {c.subject}
            </option>
          ))}
        </Select>
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

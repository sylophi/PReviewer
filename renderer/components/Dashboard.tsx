import { Link } from "@tanstack/react-router";
import { FolderGit2, FolderOpen, GitBranch, Plus, Trash2 } from "lucide-react";
import type { Diff, Repo } from "@shared/schemas";
import {
  type DiffWithRepo,
  useAllDiffs,
  useDeleteDiff,
  useDiffs,
  useResolvedDiff,
} from "@/hooks/diffs/useDiffs";
import { useRemoveRepo, useRepos } from "@/hooks/repos/useRepos";
import { useDialogs } from "@/hooks/ui/useDialogs";
import { diffTitle, labelForRef } from "@shared/refExpr";
import { formatRelativeTime } from "@/lib/relativeTime";
import { tildify } from "@/lib/projectPaths";
import { cn, focusRing } from "@/lib/utils";
import { notify } from "@/lib/toast";
import { AppToolbar, SettingsButton, ToolbarActions } from "./AppToolbar";
import { Button } from "./ui/button";

export function Dashboard() {
  const { data: repos = [], isLoading } = useRepos();
  const { openAddRepo } = useDialogs();
  const hasRepos = repos.length > 0;
  const all = useAllDiffs(repos);

  const inProgress = all.items
    .filter((d) => reviewedCount(d.diff) > 0)
    .sort(byCreatedDesc);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AppToolbar>
        <BrandMark />
        <div className="flex-1" />
        <ToolbarActions>
          <SettingsButton />
          <Button variant="ghost" size="sm" onClick={openAddRepo}>
            <FolderOpen />
            Add repo
          </Button>
        </ToolbarActions>
      </AppToolbar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && !hasRepos ? null : hasRepos ? (
          <div className="mx-auto flex max-w-5xl flex-col gap-10 px-8 pt-4 pb-16">
            {inProgress.length > 0 ? <InProgressBand items={inProgress} /> : null}
            <RepoSections repos={repos} />
          </div>
        ) : (
          <EmptyState onAddRepo={openAddRepo} />
        )}
      </main>
    </div>
  );
}

function BrandMark() {
  // Single wordmark next to the traffic lights. Geist Variable, slightly
  // larger than a body label so it carries the app identity, with a
  // softened weight so it sits in the chrome rather than asserting like
  // a page title.
  return (
    <span className="select-none truncate text-[13.5px] font-semibold tracking-[-0.01em] text-foreground/90">
      PReview
    </span>
  );
}

function byCreatedDesc(a: DiffWithRepo, b: DiffWithRepo): number {
  return b.diff.createdAt - a.diff.createdAt;
}

function reviewedCount(diff: Diff): number {
  return Object.keys(diff.reviewed).length;
}

function InProgressBand({ items }: { items: DiffWithRepo[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          In progress
        </h2>
        <span className="text-[11px] tabular text-muted-foreground/60">{items.length}</span>
      </div>
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
        {items.map((it) => (
          <DiffCard key={`${it.repo.id}:${it.diff.id}`} repo={it.repo} diff={it.diff} showRepoName />
        ))}
      </div>
    </section>
  );
}

function RepoSections({ repos }: { repos: Repo[] }) {
  return (
    <div className="flex flex-col gap-12">
      {repos.map((repo) => (
        <RepoSection key={repo.id} repo={repo} />
      ))}
    </div>
  );
}

function RepoSection({ repo }: { repo: Repo }) {
  const { confirm, openNewDiff } = useDialogs();
  const removeRepo = useRemoveRepo();
  const diffs = useDiffs(repo.id);
  const openNewDiffForRepo = () => openNewDiff(repo.id);

  const onRemove = () => {
    confirm({
      title: `Remove ${repo.name}?`,
      body: "The folder on disk isn't touched. You can add it back any time.",
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: async () => {
        await removeRepo.mutateAsync(repo.id);
        notify("Repo removed", repo.name);
      },
    });
  };

  // Per-repo grid is the surface for diffs that haven't been touched
  // yet. In-progress diffs live in the cross-repo band above so the
  // resume target isn't buried under a repo header.
  const all = diffs.data ?? [];
  const items = all
    .filter((d) => reviewedCount(d) === 0)
    .sort((a, b) => b.createdAt - a.createdAt);
  const hasOnlyBandedDiffs = all.length > 0 && items.length === 0;

  return (
    <section>
      <div className="group/repo flex items-baseline justify-between gap-3 pb-1">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="truncate text-base font-semibold tracking-tight text-foreground">
            {repo.name}
          </h2>
          <span
            className="truncate font-mono text-xs text-muted-foreground/60 opacity-0 transition-opacity group-hover/repo:opacity-100"
            title={repo.path}
          >
            {tildify(repo.path)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" onClick={openNewDiffForRepo}>
            <Plus />
            New diff
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            disabled={removeRepo.isPending}
            title="Remove from PReview"
            className="opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:text-destructive group-hover/repo:opacity-100"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="mt-4">
        {items.length > 0 ? (
          <DiffGrid repo={repo} diffs={items} />
        ) : diffs.isLoading ? null : hasOnlyBandedDiffs ? null : (
          <EmptyDiffs onCreate={openNewDiffForRepo} />
        )}
      </div>
    </section>
  );
}

function DiffGrid({ repo, diffs }: { repo: Repo; diffs: Diff[] }) {
  return (
    <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
      {diffs.map((diff) => (
        <DiffCard key={diff.id} repo={repo} diff={diff} />
      ))}
    </div>
  );
}

function DiffCard({
  repo,
  diff,
  showRepoName = false,
}: {
  repo: Repo;
  diff: Diff;
  showRepoName?: boolean;
}) {
  const deleteDiff = useDeleteDiff();
  const { confirm } = useDialogs();
  // The diff record itself doesn't carry file counts or line stats;
  // they're derived from the resolved diff. Fire the resolve query so
  // the card can show "N files +A -D" alongside the review progress.
  // staleTime: Infinity in the hook means subsequent dashboard mounts
  // (and navigating into the DiffView) reuse the same cache entry.
  const resolved = useResolvedDiff(repo.id, diff.id);

  const refLeft = labelForRef(diff.left);
  const refRight = labelForRef(diff.right);
  const reviewed = reviewedCount(diff);
  const files = resolved.data?.files ?? null;
  const totalFiles = files ? files.length : null;
  const additions = files ? files.reduce((a, f) => a + f.additions, 0) : 0;
  const deletions = files ? files.reduce((a, f) => a + f.deletions, 0) : 0;

  const onDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    confirm({
      title: `Delete ${diff.name}?`,
      body: "The diff and its review state will be removed. The repo is unaffected.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await deleteDiff.mutateAsync({ repoId: repo.id, diffId: diff.id });
        notify("Diff deleted", diff.name);
      },
    });
  };

  return (
    <Link
      to="/repos/$repoId/diffs/$diffId"
      params={{ repoId: repo.id, diffId: diff.id }}
      className={cn(
        "group relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-5 outline-none transition-colors hover:border-foreground/25",
        focusRing,
      )}
    >
      {/* Row 1: worktree binding + delete. Worktree is always rendered
          so every card reads consistently and the user can see at a
          glance which checkout the diff is bound to. Main is neutral;
          non-main is amber so attached worktrees pop. */}
      <div className="flex items-start justify-between gap-3">
        <WorktreeBindingRow path={diff.rightWorktreePath ?? null} />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          className="opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          title="Delete diff"
        >
          <Trash2 />
        </Button>
      </div>

      {/* Diff name */}
      <h3 className="min-w-0 truncate text-base font-semibold leading-tight text-foreground">
        {diff.name}
      </h3>

      {/* Ref pair */}
      <RefPairChip left={refLeft} right={refRight} />

      <div className="flex-1" />

      {/* Footer: meta left, metrics middle, status right */}
      <div className="tabular flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">
          {showRepoName ? repo.name : formatRelativeTime(diff.createdAt)}
        </span>
        <DiffMetrics
          totalFiles={totalFiles}
          additions={additions}
          deletions={deletions}
          loading={resolved.isLoading}
        />
        <ProgressLabel reviewed={reviewed} total={totalFiles} />
      </div>

      {/* Progress bar */}
      <ProgressBar reviewed={reviewed} total={totalFiles} />
    </Link>
  );
}

// "N files +A -D" once the resolve query lands. Render an em-dash
// placeholder while loading so the footer height doesn't pop, and
// nothing on a resolve error (the global mutation toast already
// surfaces failures; the card stays useable without metrics).
function DiffMetrics({
  totalFiles,
  additions,
  deletions,
  loading,
}: {
  totalFiles: number | null;
  additions: number;
  deletions: number;
  loading: boolean;
}) {
  if (totalFiles === null) {
    return (
      <span className="text-muted-foreground/40" aria-hidden>
        {loading ? "…" : ""}
      </span>
    );
  }
  if (totalFiles === 0) {
    return <span className="text-muted-foreground/50">no changes</span>;
  }
  return (
    <span
      className="flex shrink-0 items-center gap-2"
      title={`${totalFiles} file${totalFiles === 1 ? "" : "s"} changed, +${additions} / -${deletions}`}
    >
      <span>
        {totalFiles} file{totalFiles === 1 ? "" : "s"}
      </span>
      <span>
        <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>{" "}
        <span className="text-rose-600 dark:text-rose-400">-{deletions}</span>
      </span>
    </span>
  );
}

function WorktreeBindingRow({ path }: { path: string | null }) {
  // Main = neutral, no extra emphasis. Non-main = amber, because that's
  // the case where the diff is anchored somewhere besides the obvious
  // checkout and the user benefits from a visual cue.
  if (path === null) {
    return (
      <span
        className="inline-flex min-w-0 items-center gap-1.5 self-start truncate rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground"
        title="Bound to the main worktree. PReview reads its current state; opening doesn't change your checkout."
      >
        <FolderGit2 className="size-3 shrink-0" aria-hidden />
        <span className="font-medium">main</span>
      </span>
    );
  }
  const last = path.split("/").filter(Boolean).pop() ?? path;
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 self-start truncate rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300"
      title={`Bound to the ${last} worktree at ${path}. PReview reads its current state; opening doesn't change your checkout.`}
    >
      <FolderGit2 className="size-3 shrink-0" aria-hidden />
      <span className="font-medium">{last}</span>
    </span>
  );
}

function RefPairChip({ left, right }: { left: string; right: string }) {
  const title = diffTitle({ kind: "branch", name: left }, { kind: "branch", name: right });
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 self-start truncate rounded-md border border-border/60 bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground/90"
      title={title}
    >
      {left} <span className="text-muted-foreground/50">↔</span> {right}
    </span>
  );
}

function ProgressLabel({
  reviewed,
  total,
}: {
  reviewed: number;
  total: number | null;
}) {
  if (total === null) {
    // Resolve hasn't landed yet; show the absolute reviewed count if
    // any, otherwise nothing (placeholder lives in DiffMetrics).
    if (reviewed === 0) return <span className="text-muted-foreground/50">Not started</span>;
    return (
      <span className="text-emerald-600 dark:text-emerald-400">{reviewed} reviewed</span>
    );
  }
  if (total === 0) return <span className="text-muted-foreground/50">no changes</span>;
  const done = reviewed === total;
  return (
    <span
      className={cn(
        "shrink-0",
        done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
      )}
    >
      {reviewed}/{total} reviewed
    </span>
  );
}

function ProgressBar({
  reviewed,
  total,
}: {
  reviewed: number;
  total: number | null;
}) {
  // Hairline track for not-started so cards still have a bottom edge;
  // emerald accent fill scales with the reviewed fraction once the
  // resolve query lands. Pre-resolve we can't compute a percent, so
  // any reviewed-but-unknown-total just paints full-width.
  if (reviewed === 0) return <div className="-mx-5 -mb-5 h-[2px] bg-border/60" />;
  const pct =
    total === null || total === 0 ? 100 : Math.min(100, Math.round((reviewed / total) * 100));
  return (
    <div className="-mx-5 -mb-5 h-[3px] bg-border/60">
      <div
        className="h-full bg-emerald-500/80 dark:bg-emerald-400/70"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function EmptyDiffs({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-dashed border-border/50 px-5 py-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-3">
        <GitBranch className="size-4 text-muted-foreground/60" />
        <span>No diffs yet.</span>
      </div>
      <Button size="sm" variant="ghost" onClick={onCreate}>
        <Plus />
        New diff
      </Button>
    </div>
  );
}

function EmptyState({ onAddRepo }: { onAddRepo: () => void }) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center text-center">
      <h2 className="text-xl font-semibold tracking-tight">Review any diff between two refs.</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Add a git repo on disk to get started. Then create diffs between branches, commits, working
        trees, or open pull requests.
      </p>
      <div className="mt-6">
        <Button variant="default" onClick={onAddRepo}>
          <FolderOpen />
          Add repo
        </Button>
      </div>
    </div>
  );
}

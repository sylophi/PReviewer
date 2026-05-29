import { Link } from "@tanstack/react-router";
import { Check, FolderOpen, GitBranch, Pin, Plus, Trash2 } from "lucide-react";
import type { Diff, Repo } from "@shared/schemas";
import { useDeleteDiff, useDiffs } from "@/hooks/diffs/useDiffs";
import { useRemoveRepo, useRepos } from "@/hooks/repos/useRepos";
import { useDialogs } from "@/hooks/ui/useDialogs";
import { diffTitle } from "@/lib/refExpr";
import { formatRelativeTime } from "@/lib/relativeTime";
import { tildify } from "@/lib/projectPaths";
import { cn, dragRegion, focusRing } from "@/lib/utils";
import { notify } from "@/lib/toast";
import { Button } from "./ui/button";

export function Dashboard() {
  const { data: repos = [], isLoading } = useRepos();
  const { openAddRepo } = useDialogs();
  const hasRepos = repos.length > 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <div aria-hidden className="absolute inset-x-0 top-0 z-30 h-7" style={dragRegion("drag")} />
      <header className="flex shrink-0 items-center justify-between gap-4 px-8 pt-12 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Diffs</h1>
        {hasRepos ? (
          <Button variant="ghost" onClick={openAddRepo}>
            <FolderOpen />
            Add repo
          </Button>
        ) : null}
      </header>
      <main className="flex-1 overflow-y-auto px-8 pb-16">
        {isLoading && !hasRepos ? null : hasRepos ? (
          <RepoSections repos={repos} />
        ) : (
          <EmptyState onAddRepo={openAddRepo} />
        )}
      </main>
    </div>
  );
}

function RepoSections({ repos }: { repos: Repo[] }) {
  return (
    <div className="flex flex-col gap-14">
      {repos.map((repo) => (
        <RepoSection key={repo.id} repo={repo} />
      ))}
    </div>
  );
}

function RepoSection({ repo }: { repo: Repo }) {
  const { openNewDiff, confirm } = useDialogs();
  const removeRepo = useRemoveRepo();
  const diffs = useDiffs(repo.id);

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

  const items = diffs.data ?? [];

  return (
    <section>
      <div className="group/repo flex items-baseline justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="truncate text-lg font-medium text-foreground">{repo.name}</h2>
          <span
            className="truncate font-mono text-xs text-muted-foreground/60 opacity-0 transition-opacity group-hover/repo:opacity-100"
            title={repo.path}
          >
            {tildify(repo.path)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" onClick={() => openNewDiff(repo.id)}>
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
          <DiffGrid repoId={repo.id} diffs={items} />
        ) : diffs.isLoading ? null : (
          <EmptyDiffs onCreate={() => openNewDiff(repo.id)} />
        )}
      </div>
    </section>
  );
}

function DiffGrid({ repoId, diffs }: { repoId: string; diffs: Diff[] }) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
      {diffs.map((diff) => (
        <DiffCard key={diff.id} repoId={repoId} diff={diff} />
      ))}
    </div>
  );
}

function DiffCard({ repoId, diff }: { repoId: string; diff: Diff }) {
  const deleteDiff = useDeleteDiff();
  const { confirm } = useDialogs();
  const subtitle = diffTitle(diff.left, diff.right);
  const reviewedCount = Object.keys(diff.reviewed).length;
  const onDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    confirm({
      title: `Delete ${diff.name}?`,
      body: "The diff and its review state will be removed. The repo is unaffected.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        await deleteDiff.mutateAsync({ repoId, diffId: diff.id });
        notify("Diff deleted", diff.name);
      },
    });
  };
  return (
    <Link
      to="/repos/$repoId/diffs/$diffId"
      params={{ repoId, diffId: diff.id }}
      className={cn(
        "group relative flex min-h-[180px] flex-col rounded-2xl border border-border bg-card p-5 outline-none transition-all hover:border-foreground/30 hover:shadow-sm",
        focusRing,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <h3 className="min-w-0 truncate text-base font-semibold leading-tight text-foreground">
            {diff.name}
          </h3>
          {diff.pinned !== null ? (
            <Pin
              className="mt-1 size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
              aria-label="Pinned"
            />
          ) : null}
        </div>
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

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-border/60 bg-muted/30 px-2 py-1 font-mono text-[11px] text-muted-foreground/90"
          title={subtitle}
        >
          {subtitle}
        </span>
        {diff.rightWorktreePath ? (
          <span
            className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 font-mono text-[10px] text-amber-700 dark:text-amber-300"
            title={diff.rightWorktreePath}
          >
            in {tildify(diff.rightWorktreePath)}
          </span>
        ) : null}
      </div>

      <div className="flex-1" />

      <div className="tabular mt-5 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <span>{formatRelativeTime(diff.updatedAt)}</span>
        {reviewedCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Check className="size-3" />
            {reviewedCount} reviewed
          </span>
        ) : (
          <span className="text-muted-foreground/50">Not started</span>
        )}
      </div>
    </Link>
  );
}

function EmptyDiffs({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-border/60 bg-card/20 px-5 py-4 text-sm text-muted-foreground">
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

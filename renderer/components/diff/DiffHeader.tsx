import { ArrowLeft, FolderGit2, RefreshCcw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Diff, FileChange, Worktree } from "@shared/schemas";
import { diffTitle, labelForRef } from "@shared/refExpr";
import { cn, dragRegion } from "@/lib/utils";
import { AppToolbar, SettingsButton, ToolbarActions } from "../AppToolbar";
import { buttonVariants } from "../ui/button";
import { lastSegment } from "./paths";

export function DiffHeader({
  diffName,
  diff,
  files,
  boundWorktree,
}: {
  diffName: string | null;
  diff: Diff | null;
  files: FileChange[] | null;
  boundWorktree: Worktree | null;
}) {
  const reviewed = files ? files.filter((f) => f.reviewed).length : 0;
  const total = files ? files.length : 0;
  const needsCount = files ? files.filter((f) => f.needsReReview).length : 0;
  const additions = files ? files.reduce((a, f) => a + f.additions, 0) : 0;
  const deletions = files ? files.reduce((a, f) => a + f.deletions, 0) : 0;
  return (
    <AppToolbar>
      <Link
        to="/"
        style={dragRegion("no-drag")}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "shrink-0 text-muted-foreground hover:text-foreground",
        )}
        title="Back to diffs"
        aria-label="Back to diffs"
      >
        <ArrowLeft />
      </Link>
      <h1 className="min-w-0 shrink truncate text-sm font-semibold text-foreground">
        {diffName ?? ""}
      </h1>
      {diff ? <HeaderChip diff={diff} boundWorktree={boundWorktree} /> : null}
      <div className="flex-1" />
      {files && total > 0 ? (
        <>
          <span
            className="tabular shrink-0 text-xs text-muted-foreground"
            title={`+${additions} / -${deletions} across ${total} file${total === 1 ? "" : "s"}`}
          >
            <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>{" "}
            <span className="text-rose-600 dark:text-rose-400">-{deletions}</span>
          </span>
          <span
            className="tabular shrink-0 text-xs text-muted-foreground"
            title={`${reviewed} of ${total} files reviewed`}
          >
            <span className={reviewed === total ? "text-emerald-600 dark:text-emerald-400" : ""}>
              {reviewed}
            </span>
            <span className="text-muted-foreground/50">/{total}</span>
          </span>
        </>
      ) : null}
      {needsCount > 0 ? (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
          title={`${needsCount} file${needsCount === 1 ? "" : "s"} need re-review`}
        >
          <RefreshCcw className="size-3" />
          <span className="tabular">{needsCount}</span>
        </span>
      ) : null}
      <ToolbarActions>
        <SettingsButton />
      </ToolbarActions>
    </AppToolbar>
  );
}

function HeaderChip({
  diff,
  boundWorktree,
}: {
  diff: Diff;
  boundWorktree: Worktree | null;
}) {
  if (diff.rightWorktreePath) {
    // Folder icon establishes the "this is on disk" meaning so the
    // worktree name doesn't need an "in" prefix and the branch can
    // sit beside it in mono without a separator dot.
    const name = lastSegment(diff.rightWorktreePath);
    const branch = boundWorktree?.branch ?? null;
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300"
        title={`Bound to ${name} at ${diff.rightWorktreePath}. PReview reads its current state; opening doesn't change your checkout.`}
      >
        <FolderGit2 className="size-3 shrink-0" aria-hidden />
        <span className="font-medium">{name}</span>
        {branch ? (
          <span className="font-mono text-amber-700/80 dark:text-amber-300/80">{branch}</span>
        ) : null}
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 font-mono text-[11px] text-muted-foreground/90"
      title={diffTitle(diff.left, diff.right)}
    >
      {labelForRef(diff.left)}
      <span className="text-muted-foreground/50">↔</span>
      {labelForRef(diff.right)}
    </span>
  );
}

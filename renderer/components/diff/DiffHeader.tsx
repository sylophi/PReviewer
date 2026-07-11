import { useState } from "react";
import { ArrowLeft, FolderGit2, Keyboard, Pin, PinOff, RefreshCcw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Diff, FileChange, Worktree } from "@shared/schemas";
import { useSetPin } from "@/hooks/diffs/useDiffs";
import { diffTitle, labelForRef } from "@shared/refExpr";
import { notify } from "@/lib/toast";
import { cn, dragRegion } from "@/lib/utils";
import { AppToolbar, SettingsButton, ToolbarActions } from "../AppToolbar";
import { Button, buttonVariants } from "../ui/button";
import { Kbd, KbdGroup } from "../ui/kbd";
import { lastSegment } from "./paths";

export function DiffHeader({
  repoId,
  diffName,
  diff,
  files,
  boundWorktree,
}: {
  repoId: string;
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
        title="Back to diffs (⌘⇧D)"
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
        {diff ? <PinToggle repoId={repoId} diff={diff} /> : null}
        <ShortcutsHelp />
        <SettingsButton />
      </ToolbarActions>
    </AppToolbar>
  );
}

// Freeze / unfreeze the diff at the currently-resolved commits. While
// pinned, the diff ignores ref motion (new commits, force-pushes) and
// editing is disabled — the classic "hold this still while I finish
// reading" move.
function PinToggle({ repoId, diff }: { repoId: string; diff: Diff }) {
  const setPin = useSetPin();
  const pinned = diff.pinned !== null;
  const onToggle = () => {
    setPin.mutate(
      { repoId, diffId: diff.id, pinned: !pinned },
      {
        onSuccess: () => {
          notify(
            pinned ? "Diff unpinned" : "Diff pinned",
            pinned ? "Following the refs again." : "Frozen at the current commits until you unpin.",
          );
        },
      },
    );
  };
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onToggle}
      disabled={setPin.isPending}
      className={cn(
        pinned
          ? "text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
          : "text-muted-foreground hover:text-foreground",
      )}
      title={
        pinned
          ? "Pinned: frozen at specific commits. Click to follow the refs again."
          : "Pin: freeze this diff at the current commits so ref motion can't change it. Disables editing."
      }
      aria-label={pinned ? "Unpin diff" : "Pin diff"}
    >
      {pinned ? <PinOff /> : <Pin />}
    </Button>
  );
}

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["⌘", "↩"], label: "Mark reviewed, go to next unreviewed" },
  { keys: ["⌘", "J"], label: "Next unreviewed file" },
  { keys: ["⌘⇧", "]"], label: "Next tab" },
  { keys: ["⌘⇧", "["], label: "Previous tab" },
  { keys: ["⌘", "1–9"], label: "Go to tab" },
  { keys: ["⌘", "W"], label: "Close tab" },
  { keys: ["⌘⇧", "U"], label: "Toggle split / unified" },
  { keys: ["⌘", "B"], label: "Toggle file tree" },
  { keys: ["⌘⇧", "D"], label: "Back to dashboard" },
];

function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen((v) => !v)}
        className={cn(open ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
        title="Keyboard shortcuts"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
      >
        <Keyboard />
      </Button>
      {open ? (
        <>
          {/* Click-away layer under the panel. */}
          <button
            type="button"
            aria-label="Close shortcuts"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl">
            <div className="pb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
              Keyboard shortcuts
            </div>
            <ul className="flex flex-col gap-1.5">
              {SHORTCUTS.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{s.label}</span>
                  <KbdGroup className="shrink-0">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </KbdGroup>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

function HeaderChip({ diff, boundWorktree }: { diff: Diff; boundWorktree: Worktree | null }) {
  if (diff.rightWorktreePath) {
    // Folder icon establishes the "this is on disk" meaning so the
    // worktree name doesn't need an "in" prefix and the branch can
    // sit beside it in mono without a separator dot.
    const name = lastSegment(diff.rightWorktreePath);
    const branch = boundWorktree?.branch ?? null;
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300"
        title={`Bound to ${name} at ${diff.rightWorktreePath}. PReviewer reads its current state; opening doesn't change your checkout.`}
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

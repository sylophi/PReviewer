import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { DiffEditor, Editor, type DiffOnMount, type OnMount } from "@monaco-editor/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FileText,
  FolderGit2,
  RefreshCcw,
  X,
} from "lucide-react";
import type { Diff, FileChange, Worktree } from "@shared/schemas";
import { useResolvedDiff, useSetReviewed } from "@/hooks/diffs/useDiffs";
import { useFullFileTree } from "@/hooks/diffs/useFullFileTree";
import { useReadFile } from "@/hooks/diffs/useReadFile";
import { useWriteFile } from "@/hooks/diffs/useWriteFile";
import { useWorktrees } from "@/hooks/repos/useWorktrees";
import { useTheme } from "@/hooks/ui/useTheme";
import { languageForPath } from "@/lib/language";
import { diffTitle, labelForRef } from "@/lib/refExpr";
import { cn, dragRegion, focusRing } from "@/lib/utils";
import {
  PIERRE_FONT_FAMILY,
  PIERRE_FONT_SIZE,
  PIERRE_LINE_HEIGHT,
} from "@/monaco-setup";
import { AppToolbar, ThemeToggle, ToolbarActions } from "./AppToolbar";
import { Badge } from "./ui/badge";
import { buttonVariants } from "./ui/button";
import { MaterialIcon } from "./ui/material-icon";
import { Segmented } from "./ui/segmented";
import { Skeleton } from "./ui/skeleton";

type DiffStyle = "split" | "inline";
type TreeMode = "changed" | "full";

interface Tab {
  path: string;
  // Preview tabs get replaced when another file is opened as preview.
  preview: boolean;
  // Each tab carries its own diff layout, so toggling Split/Unified on
  // one file doesn't change every other open tab.
  diffStyle: DiffStyle;
}

// File-tree rail is user-resizable, with the width persisted across
// sessions. Mirrors shigomori's sidebar pattern (state in the parent,
// resize handle as a sibling of the aside, mousedown installs document-
// level listeners). Clamped to MIN/MAX to keep the rail usable.
const TREE_WIDTH_KEY = "diffView.fileTreeWidth";
const TREE_MIN = 200;
const TREE_MAX = 600;
const TREE_DEFAULT = 272;

function readStoredTreeWidth(): number {
  try {
    const raw = window.localStorage.getItem(TREE_WIDTH_KEY);
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isFinite(n)) return TREE_DEFAULT;
    return Math.min(TREE_MAX, Math.max(TREE_MIN, n));
  } catch {
    return TREE_DEFAULT;
  }
}

export function DiffView() {
  const { repoId, diffId } = useParams({ from: "/repos/$repoId/diffs/$diffId" });
  const resolved = useResolvedDiff(repoId, diffId);
  const worktrees = useWorktrees(repoId);

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [treeMode, setTreeMode] = useState<TreeMode>("changed");
  const [treeWidth, setTreeWidth] = useState<number>(readStoredTreeWidth);
  const fullTree = useFullFileTree(repoId, diffId);

  // Drag-to-resize for the file-tree rail. Captures the rail's left
  // edge at mousedown so the new width is computed relative to it
  // (event.clientX alone would only work if the rail sat at x=0). A
  // local `last` tracks the freshest width for persistence, since the
  // closure over `treeWidth` would otherwise be stale by mouseup.
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    const railEl = handle.previousElementSibling as HTMLElement | null;
    if (!railEl) return;
    const railLeft = railEl.getBoundingClientRect().left;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    let last = railEl.getBoundingClientRect().width;
    const onMove = (ev: MouseEvent) => {
      last = Math.min(TREE_MAX, Math.max(TREE_MIN, ev.clientX - railLeft));
      setTreeWidth(last);
    };
    const onUp = () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      try {
        window.localStorage.setItem(TREE_WIDTH_KEY, String(Math.round(last)));
      } catch {
        // localStorage may be unavailable; not fatal.
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // Look up the worktree the right side is bound to, so the header
  // chip can show both the worktree name and its current branch without
  // an extra IPC just for that label.
  const boundWorktree = useMemo<Worktree | null>(() => {
    if (!resolved.data?.diff.rightWorktreePath) return null;
    return (
      worktrees.data?.find((w) => w.path === resolved.data!.diff.rightWorktreePath) ?? null
    );
  }, [resolved.data, worktrees.data]);

  // Paths in the changed-files set route to the DiffEditor; everything
  // else from the full tree opens as a plain Editor.
  const changedPaths = useMemo(() => {
    const s = new Set<string>();
    for (const f of resolved.data?.files ?? []) s.add(f.path);
    return s;
  }, [resolved.data]);

  // Single click opens as preview (replaces any existing preview);
  // double click or starting to edit promotes the active tab to permanent.
  const openFile = useCallback((path: string, mode: "preview" | "permanent") => {
    setTabs((prev) => {
      const existingIdx = prev.findIndex((t) => t.path === path);
      if (existingIdx >= 0) {
        if (mode === "permanent" && prev[existingIdx].preview) {
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], preview: false };
          return next;
        }
        return prev;
      }
      const newTab: Tab = { path, preview: mode === "preview", diffStyle: "split" };
      if (mode === "preview") {
        const previewIdx = prev.findIndex((t) => t.preview);
        if (previewIdx >= 0) {
          const next = [...prev];
          next[previewIdx] = newTab;
          return next;
        }
      }
      return [...prev, newTab];
    });
    setActivePath(path);
  }, []);

  const setTabDiffStyle = useCallback((path: string, next: DiffStyle) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      if (idx < 0) return prev;
      if (prev[idx].diffStyle === next) return prev;
      const out = [...prev];
      out[idx] = { ...out[idx], diffStyle: next };
      return out;
    });
  }, []);

  // First mount, or any time the resolved diff loads and no tab is open
  // yet, land directly on the first unreviewed file (falling back to
  // the first file when everything is already reviewed). The user came
  // here to read; making them click to start the reading is friction.
  useEffect(() => {
    if (activePath !== null) return;
    const files = resolved.data?.files ?? [];
    if (files.length === 0) return;
    const target = files.find((f) => !f.reviewed) ?? files[0];
    if (target) openFile(target.path, "preview");
  }, [resolved.data, activePath, openFile]);

  const closeTab = useCallback(
    (path: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.path === path);
        if (idx < 0) return prev;
        const next = prev.toSpliced(idx, 1);
        if (activePath === path) {
          const fallback = next[idx] ?? next[idx - 1] ?? null;
          setActivePath(fallback?.path ?? null);
        }
        return next;
      });
    },
    [activePath],
  );

  const diffName = resolved.data
    ? (resolved.data.diff.name ?? diffTitle(resolved.data.diff.left, resolved.data.diff.right))
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DiffHeader
        diffName={diffName}
        diff={resolved.data?.diff ?? null}
        files={resolved.data?.files ?? null}
        boundWorktree={boundWorktree}
      />
      <main className="flex min-h-0 flex-1">
        {resolved.isLoading ? (
          <LoadingSkeleton width={treeWidth} />
        ) : resolved.error ? (
          <ErrorState message={(resolved.error as Error).message} />
        ) : resolved.data ? (
          <>
            <FileTreePanel
              repoId={repoId}
              diffId={diffId}
              width={treeWidth}
              files={resolved.data.files}
              fullPaths={fullTree.data ?? null}
              fullLoading={fullTree.isLoading}
              mode={treeMode}
              onModeChange={setTreeMode}
              activePath={activePath}
              onClick={(p) => openFile(p, "preview")}
              onDoubleClick={(p) => openFile(p, "permanent")}
            />
            <ResizeHandle onMouseDown={startResize} />
            <section className="flex min-w-0 flex-1 flex-col">
              <TabStrip
                tabs={tabs}
                activePath={activePath}
                onActivate={setActivePath}
                onClose={closeTab}
                onPromote={(p) => openFile(p, "permanent")}
                onSetDiffStyle={setTabDiffStyle}
              />
              <div className="min-h-0 flex-1">
                {activePath ? (
                  <DiffTabBody
                    key={activePath}
                    repoId={repoId}
                    diffId={diffId}
                    path={activePath}
                    diffStyle={
                      tabs.find((t) => t.path === activePath)?.diffStyle ?? "split"
                    }
                    isChanged={changedPaths.has(activePath)}
                    boundWorktree={boundWorktree}
                  />
                ) : resolved.data.files.length === 0 ? (
                  <EmptyChangesHint
                    treeMode={treeMode}
                    onSwitchToFull={() => setTreeMode("full")}
                  />
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function DiffHeader({
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
        <span
          className="tabular shrink-0 text-xs text-muted-foreground"
          title={`${reviewed} of ${total} files reviewed`}
        >
          <span className={reviewed === total ? "text-emerald-600 dark:text-emerald-400" : ""}>
            {reviewed}
          </span>
          <span className="text-muted-foreground/50">/{total}</span>
        </span>
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
        <ThemeToggle />
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

function lastSegment(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function FileTreePanel({
  repoId,
  diffId,
  width,
  files,
  fullPaths,
  fullLoading,
  mode,
  onModeChange,
  activePath,
  onClick,
  onDoubleClick,
}: {
  repoId: string;
  diffId: string;
  width: number;
  files: FileChange[];
  fullPaths: string[] | null;
  fullLoading: boolean;
  mode: TreeMode;
  onModeChange: (next: TreeMode) => void;
  activePath: string | null;
  onClick: (path: string) => void;
  onDoubleClick: (path: string) => void;
}) {
  const reviewedCount = files.filter((f) => f.reviewed).length;
  const setReviewed = useSetReviewed();
  const onToggleReviewed = (path: string, next: boolean) => {
    setReviewed.mutate({ repoId, diffId, path, reviewed: next });
  };

  const changedByPath = useMemo(() => {
    const m = new Map<string, FileChange>();
    for (const f of files) m.set(f.path, f);
    return m;
  }, [files]);

  // In full-tree mode we merge the changed-files set with the full
  // listing so changed files stay annotated (kind + diffstat + reviewed
  // checkbox) and untouched files render plain.
  const rows = useMemo(() => {
    if (mode === "changed") return files.map((f) => ({ kind: "changed" as const, file: f }));
    if (!fullPaths) return files.map((f) => ({ kind: "changed" as const, file: f }));
    const seen = new Set<string>();
    const merged: Array<
      { kind: "changed"; file: FileChange } | { kind: "plain"; path: string }
    > = [];
    for (const p of fullPaths) {
      seen.add(p);
      const ch = changedByPath.get(p);
      merged.push(ch ? { kind: "changed", file: ch } : { kind: "plain", path: p });
    }
    // Catch additions / untracked that may not be in `git ls-tree`.
    for (const f of files) {
      if (!seen.has(f.path)) merged.push({ kind: "changed", file: f });
    }
    return merged;
  }, [mode, files, fullPaths, changedByPath]);

  // Build, compact (fuse single-child folder chains), and sort the tree
  // so the rail renders as a real hierarchy. Re-built whenever the row
  // set changes; cheap for typical diffs.
  const tree = useMemo(() => buildTree(rows), [rows]);
  const allFolderPaths = useMemo(() => collectFolderPaths(tree), [tree]);

  // Collapse defaults differ by mode: Changed mode opens everything
  // (the user came here to read the diff and the set is small), Full
  // mode collapses every folder EXCEPT those that contain a changed
  // file, so reviewers see their changes in context without losing
  // sight of them in a thousand-file tree. We re-init on mode flip
  // and on the first time the full tree loads, but otherwise leave
  // user toggles alone so file-list refetches don't blow them away.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const fullModeInitialized = useRef(false);
  useEffect(() => {
    if (mode === "changed") {
      setCollapsed(new Set());
      fullModeInitialized.current = false;
      return;
    }
    if (!fullModeInitialized.current && allFolderPaths.length > 0) {
      const changedPaths = files.map((f) => f.path);
      const next = new Set<string>();
      for (const folderPath of allFolderPaths) {
        const prefix = folderPath + "/";
        const hasChange = changedPaths.some((p) => p === folderPath || p.startsWith(prefix));
        if (!hasChange) next.add(folderPath);
      }
      setCollapsed(next);
      fullModeInitialized.current = true;
    }
  }, [mode, allFolderPaths, files]);

  const onToggleCollapse = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Flatten the tree to only the rows currently visible (folders +
  // descendants of any expanded folder). The virtualizer scrolls this
  // list, so the cost of full-tree mode is bounded by what's actually
  // on screen rather than the total path count.
  const flatRows = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => 24,
    overscan: 12,
    getItemKey: (i) => flatRows[i]?.key ?? i,
  });

  return (
    <aside
      style={{ width }}
      className="flex shrink-0 flex-col border-r border-border bg-card/30"
    >
      <div className="flex shrink-0 flex-col gap-2 px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/60">
            Files
          </div>
          <div
            className="text-xs text-muted-foreground/60"
            title={`${reviewedCount} of ${files.length} reviewed`}
          >
            {mode === "changed" ? `${files.length} changed` : `${rows.length} in tree`}
          </div>
        </div>
        <Segmented
          label="File tree mode"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: "changed", label: "Changed" },
            { value: "full", label: "Full tree" },
          ]}
          fullWidth
        />
      </div>
      <div ref={viewportRef} className="flex-1 overflow-y-auto p-2 text-xs">
        {mode === "changed" && files.length === 0 ? (
          <div className="px-2 py-3 text-center text-muted-foreground">No changes.</div>
        ) : mode === "full" && fullLoading && !fullPaths ? (
          <div className="px-2 py-3 text-center text-muted-foreground">Loading tree…</div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const row = flatRows[vi.index];
              if (!row) return null;
              return (
                <div
                  key={row.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  {row.kind === "folder" ? (
                    <TreeFolderRow
                      node={row.node}
                      depth={row.depth}
                      collapsed={collapsed.has(row.node.path)}
                      onToggle={onToggleCollapse}
                    />
                  ) : (
                    <TreeFileRow
                      node={row.node}
                      depth={row.depth}
                      active={row.node.path === activePath}
                      setReviewedPending={setReviewed.isPending}
                      onToggleReviewed={onToggleReviewed}
                      onClick={onClick}
                      onDoubleClick={onDoubleClick}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; file: FileChange | null };

type TreeRowInput =
  | { kind: "changed"; file: FileChange }
  | { kind: "plain"; path: string };

type TreeFolder = Extract<TreeNode, { kind: "folder" }>;
type TreeFile = Extract<TreeNode, { kind: "file" }>;

type FlatRow =
  | { kind: "folder"; node: TreeFolder; depth: number; key: string }
  | { kind: "file"; node: TreeFile; depth: number; key: string };

// Walk the tree producing a flat list of currently-visible rows, given
// which folders are collapsed. Root folder is skipped (it has no row);
// its children sit at depth 0. Used by the virtualizer.
function flattenTree(root: TreeFolder, collapsed: Set<string>): FlatRow[] {
  const out: FlatRow[] = [];
  function walk(node: TreeNode, depth: number): void {
    if (node.kind === "folder") {
      out.push({ kind: "folder", node, depth, key: node.path });
      if (collapsed.has(node.path)) return;
      for (const child of node.children) walk(child, depth + 1);
    } else {
      out.push({ kind: "file", node, depth, key: node.path });
    }
  }
  for (const child of root.children) walk(child, 0);
  return out;
}

// Every folder path in the (compacted) tree. Feeds the "default
// collapsed" initialization for Full-tree mode.
function collectFolderPaths(root: TreeFolder): string[] {
  const out: string[] = [];
  function walk(node: TreeNode): void {
    if (node.kind !== "folder") return;
    if (node.path) out.push(node.path);
    for (const child of node.children) walk(child);
  }
  walk(root);
  return out;
}

function buildTree(rows: TreeRowInput[]): TreeFolder {
  const root: TreeFolder = { kind: "folder", name: "", path: "", children: [] };
  for (const row of rows) {
    const path = row.kind === "changed" ? row.file.path : row.path;
    const file = row.kind === "changed" ? row.file : null;
    insertPath(root, path.split("/"), 0, path, file);
  }
  // sortTree/compactTree only collapse non-root folders, so the root
  // stays a folder; reassert the type for the renderer.
  const compactedSorted = compactTree(sortTree(root));
  return compactedSorted as TreeFolder;
}

function insertPath(
  parent: TreeNode,
  segs: string[],
  depth: number,
  fullPath: string,
  file: FileChange | null,
): void {
  if (parent.kind !== "folder") return;
  const segment = segs[depth];
  const isLast = depth === segs.length - 1;
  const partialPath = segs.slice(0, depth + 1).join("/");
  let child = parent.children.find((c) => c.name === segment);
  if (!child) {
    child = isLast
      ? { kind: "file", name: segment, path: fullPath, file }
      : { kind: "folder", name: segment, path: partialPath, children: [] };
    parent.children.push(child);
  } else if (isLast && child.kind === "file") {
    // Same path seen again (e.g. duplicated by the full-tree merge): keep
    // the FileChange annotation if either occurrence had one.
    child.file = file ?? child.file;
  }
  if (!isLast) insertPath(child, segs, depth + 1, fullPath, file);
}

// Fuse chains of single-child folders so "src/components/ui/Button.tsx"
// renders as one folder row "src/components/ui" + the file, rather than
// four indented rows.
function compactTree(node: TreeNode): TreeNode {
  if (node.kind !== "folder") return node;
  const compactedChildren = node.children.map(compactTree);
  if (node.name !== "" && compactedChildren.length === 1) {
    const only = compactedChildren[0];
    if (only.kind === "folder") {
      return {
        kind: "folder",
        name: `${node.name}/${only.name}`,
        path: only.path,
        children: only.children,
      };
    }
  }
  return { ...node, children: compactedChildren };
}

// Folders before files, alphabetical within each.
function sortTree(node: TreeNode): TreeNode {
  if (node.kind !== "folder") return node;
  const sorted = [...node.children].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { ...node, children: sorted.map(sortTree) };
}

function TreeFolderRow({
  node,
  depth,
  collapsed,
  onToggle,
}: {
  node: TreeFolder;
  depth: number;
  collapsed: boolean;
  onToggle: (path: string) => void;
}) {
  // Slightly tighter than file rows because the folder row carries less
  // information; sits at depth*12 + 4 from the left edge so the chevron
  // lines up cleanly under its parent's name when expanded. The icon
  // resolves by the last segment of the (possibly compacted) name, so
  // chains like "src/components/ui" pick up the deepest folder's icon.
  const indent = depth * 12 + 4;
  const iconName = node.name.split("/").pop() ?? node.name;
  return (
    <button
      type="button"
      onClick={() => onToggle(node.path)}
      className={cn(
        "flex h-6 w-full items-center gap-1 rounded-md pr-2 text-left outline-none transition-colors hover:bg-muted",
        focusRing,
      )}
      style={{ paddingLeft: indent }}
      title={node.path}
    >
      <ChevronRight
        className={cn(
          "size-3 shrink-0 text-muted-foreground transition-transform",
          !collapsed && "rotate-90",
        )}
      />
      <MaterialIcon kind="folder" name={iconName} expanded={!collapsed} className="size-3.5" />
      <span className="min-w-0 truncate font-mono text-muted-foreground/90">
        {node.name}
      </span>
    </button>
  );
}

function TreeFileRow({
  node,
  depth,
  active,
  setReviewedPending,
  onToggleReviewed,
  onClick,
  onDoubleClick,
}: {
  node: TreeFile;
  depth: number;
  active: boolean;
  setReviewedPending: boolean;
  onToggleReviewed: (path: string, next: boolean) => void;
  onClick: (path: string) => void;
  onDoubleClick: (path: string) => void;
}) {
  const file = node.file;
  // Files indent one notch deeper than the matching chevron so the
  // basename column visually anchors under the folder name above.
  const indent = depth * 12 + 6;
  return (
    <div
      className={cn(
        "group flex h-6 items-center gap-1.5 rounded-md pr-2 transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted",
        file?.reviewed && !active && "opacity-60",
      )}
      style={{ paddingLeft: indent }}
    >
      {file ? (
        <ReviewedCheckbox
          checked={file.reviewed}
          pending={setReviewedPending}
          onChange={(next) => onToggleReviewed(file.path, next)}
        />
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        onClick={() => onClick(node.path)}
        onDoubleClick={() => onDoubleClick(node.path)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none",
          focusRing,
        )}
        title={node.path}
      >
        <MaterialIcon kind="file" name={node.name} className="size-3.5" />
        {file ? (
          <Badge tone={kindTone(file.kind)} size="sm" mono className="shrink-0">
            {kindShort(file.kind)}
          </Badge>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono",
            file?.reviewed && "line-through decoration-muted-foreground/50",
            !file && "text-muted-foreground/80",
          )}
        >
          {node.name}
        </span>
        {file?.needsReReview ? (
          <RefreshCcw
            className="size-3 shrink-0 text-amber-600 dark:text-amber-400"
            aria-label="Needs re-review"
          />
        ) : file && (file.additions > 0 || file.deletions > 0) ? (
          <span className="tabular shrink-0 text-muted-foreground/70">
            <span className="text-emerald-500">+{file.additions}</span>{" "}
            <span className="text-rose-500">-{file.deletions}</span>
          </span>
        ) : null}
      </button>
    </div>
  );
}

function ReviewedCheckbox({
  checked,
  pending,
  onChange,
}: {
  checked: boolean;
  pending: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      disabled={pending}
      title={checked ? "Mark unreviewed" : "Mark reviewed"}
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded border outline-none transition-colors",
        focusRing,
        checked
          ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
          : "border-border bg-background/60 text-transparent hover:border-foreground/40",
      )}
    >
      <Check className="size-3" strokeWidth={3} />
    </button>
  );
}

function TabStrip({
  tabs,
  activePath,
  onActivate,
  onClose,
  onPromote,
  onSetDiffStyle,
}: {
  tabs: Tab[];
  activePath: string | null;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
  onPromote: (path: string) => void;
  onSetDiffStyle: (path: string, next: DiffStyle) => void;
}) {
  // Nothing open: render a 32px empty strip so the layout doesn't jump.
  // (Land-on-first-unreviewed means the user almost never sees this on
  // the happy path; the strip exists to hold the border below.)
  if (tabs.length === 0) {
    return <div className="h-8 shrink-0 border-b border-border bg-card/40" />;
  }
  const activeTab = tabs.find((t) => t.path === activePath) ?? null;
  return (
    <div className="flex h-8 shrink-0 items-stretch border-b border-border bg-card/40">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.path === activePath;
          return (
            <div
              key={tab.path}
              className={cn(
                "group flex max-w-[260px] shrink-0 items-center gap-1.5 border-r border-border px-2.5 text-xs",
                active
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onActivate(tab.path)}
                onDoubleClick={() => onPromote(tab.path)}
                className={cn(
                  "flex min-w-0 items-center gap-1.5 outline-none",
                  focusRing,
                  tab.preview && "italic",
                )}
                title={tab.path}
              >
                <FileText className="size-3 shrink-0 opacity-60" />
                <span className="min-w-0 truncate font-mono">{basename(tab.path)}</span>
              </button>
              <button
                type="button"
                onClick={() => onClose(tab.path)}
                className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                title="Close tab"
                aria-label="Close tab"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
      {activeTab ? (
        <div className="flex shrink-0 items-center px-2">
          <Segmented
            label="Diff layout"
            value={activeTab.diffStyle}
            onChange={(next) => onSetDiffStyle(activeTab.path, next)}
            options={[
              { value: "split", label: "Split" },
              { value: "inline", label: "Unified" },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function DiffTabBody({
  repoId,
  diffId,
  path,
  diffStyle,
  isChanged,
  boundWorktree,
}: {
  repoId: string;
  diffId: string;
  path: string;
  diffStyle: DiffStyle;
  isChanged: boolean;
  boundWorktree: Worktree | null;
}) {
  if (!isChanged) {
    return <FileBrowseBody repoId={repoId} diffId={diffId} path={path} />;
  }
  return (
    <DiffEditorBody
      repoId={repoId}
      diffId={diffId}
      path={path}
      diffStyle={diffStyle}
      boundWorktree={boundWorktree}
    />
  );
}

function DiffEditorBody({
  repoId,
  diffId,
  path,
  diffStyle,
  boundWorktree,
}: {
  repoId: string;
  diffId: string;
  path: string;
  diffStyle: DiffStyle;
  boundWorktree: Worktree | null;
}) {
  const { resolved } = useTheme();
  const leftQ = useReadFile(repoId, diffId, path, "left");
  const rightQ = useReadFile(repoId, diffId, path, "right");
  const write = useWriteFile();

  // Treat the modified side as locally-owned once Monaco has it: external
  // refetches (after our own save) won't reset the user's cursor or
  // pending edits. Reset whenever the path changes (component remounts
  // via the key prop in DiffView, so this is a fresh useState on each).
  const [localRight, setLocalRight] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `editable` is sourced from the IPC read result and may flip after
  // mount. The change-content listener registered in onMount captures
  // its closure values once, so we read editability through a ref to
  // always see the latest value without re-running onMount.
  const editableRef = useRef(false);

  useEffect(() => {
    if (localRight === null && rightQ.data !== undefined) {
      setLocalRight(rightQ.data.content ?? "");
    }
  }, [rightQ.data, localRight]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const scheduleSave = useCallback(
    (content: string) => {
      setLocalRight(content);
      setSaveState("dirty");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        setSaveState("saving");
        write.mutate(
          { repoId, diffId, path, content },
          {
            onSuccess: () => setSaveState("saved"),
            onError: () => setSaveState("error"),
          },
        );
      }, 400);
    },
    [repoId, diffId, path, write],
  );

  const onMount: DiffOnMount = useCallback(
    (editor) => {
      const layout = () => editor.layout();
      layout();
      window.addEventListener("resize", layout);
      const modifiedEditor = editor.getModifiedEditor();
      modifiedEditor.onDidChangeModelContent((e) => {
        // Programmatic content sets (mount, prop-driven model rebuilds,
        // external refetch) arrive with `isFlush: true` and aren't user
        // edits. Read-only diffs (PR heads, frozen pins) also never
        // produce real edits; if we tried to save them the main
        // process would reject the IPC call anyway.
        if (e.isFlush) return;
        if (!editableRef.current) return;
        const next = modifiedEditor.getValue();
        scheduleSave(next);
      });
    },
    [scheduleSave],
  );

  const loading = leftQ.isLoading || rightQ.isLoading;
  const error = leftQ.error || rightQ.error;
  if (error) {
    return <ErrorState message={(error as Error).message} />;
  }

  const left = leftQ.data?.content ?? "";
  const right = localRight ?? rightQ.data?.content ?? "";
  const editable = rightQ.data?.editable ?? false;
  editableRef.current = editable;
  const language = languageForPath(path);

  const liveWorktreeName = boundWorktree ? lastSegment(boundWorktree.path) : null;
  return (
    <div className="relative h-full w-full">
      <SaveBadge state={saveState} editable={editable} worktreeName={liveWorktreeName} />
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : null}
      <DiffEditor
        original={left}
        modified={right}
        language={language}
        theme={resolved === "dark" ? "pierre-dark" : "pierre-light"}
        onMount={onMount}
        options={{
          readOnly: !editable,
          renderSideBySide: diffStyle === "split",
          originalEditable: false,
          automaticLayout: true,
          fontSize: PIERRE_FONT_SIZE,
          lineHeight: PIERRE_LINE_HEIGHT,
          fontFamily: PIERRE_FONT_FAMILY,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "off",
          renderWhitespace: "none",
          guides: { indentation: false },
          diffWordWrap: "off",
        }}
      />
    </div>
  );
}

function SaveBadge({
  state,
  editable,
  worktreeName,
}: {
  state: SaveState;
  editable: boolean;
  worktreeName: string | null;
}) {
  // Read-only diffs (PR head SHAs, frozen pins) are the boring case. The
  // editable case is the one worth signaling, so the chip says "live"
  // when nothing is happening, and the user gets save-state transitions
  // when they're typing.
  if (!editable) return null;
  if (state === "idle") {
    return (
      <div
        className="absolute right-3 top-2 z-10 inline-flex items-center gap-1.5 rounded bg-card/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70 shadow-sm ring-1 ring-border backdrop-blur-sm"
        title={
          worktreeName
            ? `Edits write to the ${worktreeName} worktree's working tree.`
            : "Edits write to the working tree."
        }
      >
        <span>live</span>
        {worktreeName ? (
          <span className="font-medium normal-case tracking-normal text-muted-foreground">
            {worktreeName}
          </span>
        ) : null}
      </div>
    );
  }
  const label =
    state === "dirty"
      ? "unsaved"
      : state === "saving"
        ? "saving…"
        : state === "saved"
          ? "saved"
          : "save failed";
  const cls =
    state === "saved"
      ? "text-emerald-600 dark:text-emerald-400"
      : state === "error"
        ? "text-destructive"
        : "text-muted-foreground/80";
  return (
    <div
      className={cn(
        "absolute right-3 top-2 z-10 rounded bg-card/80 px-2 py-0.5 text-[10px] uppercase tracking-wide shadow-sm ring-1 ring-border backdrop-blur-sm",
        cls,
      )}
    >
      {label}
    </div>
  );
}

function LoadingSkeleton({ width }: { width: number }) {
  return (
    <aside
      style={{ width }}
      className="shrink-0 border-r border-border bg-card/30 p-3"
    >
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className={cn("h-5", i % 2 ? "w-3/4" : "w-2/3")} />
        ))}
      </div>
    </aside>
  );
}

// A 1px column separator with an 8px hit area, sitting between the
// file-tree aside and the editor section. The hit area extends to
// both sides via the inset overlay so the column is comfortable to
// grab without making the visible line any thicker.
function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize file tree"
      tabIndex={-1}
      className="relative w-px shrink-0 cursor-col-resize bg-border"
    >
      <div className="absolute inset-y-0 -left-1 w-2" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="mx-auto mt-12 max-w-md rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
      <div className="text-sm font-medium text-destructive">Couldn't load this diff.</div>
      <div className="mt-1.5 select-text text-xs text-destructive/80">{message}</div>
    </div>
  );
}

// Single-pane editor used when the user opens a file from the Full tree
// that isn't part of the diff. Shows the right-side content (or the
// left side if the file no longer exists on the right). Read-only; this
// surface is for tracing symbols, not authoring.
function FileBrowseBody({
  repoId,
  diffId,
  path,
}: {
  repoId: string;
  diffId: string;
  path: string;
}) {
  const { resolved } = useTheme();
  const rightQ = useReadFile(repoId, diffId, path, "right");
  const leftQ = useReadFile(repoId, diffId, path, "left");

  const onMount: OnMount = useCallback((editor) => {
    const layout = () => editor.layout();
    layout();
    window.addEventListener("resize", layout);
  }, []);

  const loading = rightQ.isLoading || leftQ.isLoading;
  const error = rightQ.error || leftQ.error;
  if (error) return <ErrorState message={(error as Error).message} />;

  // Prefer right; fall back to left if right is missing (e.g., file was
  // deleted between left and right).
  const content = rightQ.data?.content ?? leftQ.data?.content ?? "";

  return (
    <div className="relative h-full w-full">
      <div className="absolute right-3 top-2 z-10 rounded bg-card/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/70 shadow-sm ring-1 ring-border backdrop-blur-sm">
        unchanged
      </div>
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      ) : null}
      <Editor
        value={content}
        language={languageForPath(path)}
        theme={resolved === "dark" ? "pierre-dark" : "pierre-light"}
        onMount={onMount}
        options={{
          readOnly: true,
          automaticLayout: true,
          fontSize: PIERRE_FONT_SIZE,
          lineHeight: PIERRE_LINE_HEIGHT,
          fontFamily: PIERRE_FONT_FAMILY,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "off",
          renderWhitespace: "none",
          guides: { indentation: false },
        }}
      />
    </div>
  );
}

function EmptyChangesHint({
  treeMode,
  onSwitchToFull,
}: {
  treeMode: TreeMode;
  onSwitchToFull: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="text-sm font-medium text-foreground">No changes between these refs.</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The left and right resolve to the same tree, so there's nothing to review.
          {treeMode === "changed"
            ? " You can still switch to Full tree to browse the project."
            : " Pick a file from the tree on the left to browse it."}
        </p>
        {treeMode === "changed" ? (
          <button
            type="button"
            onClick={onSwitchToFull}
            className={cn(
              "mt-4 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent outline-none",
              focusRing,
            )}
          >
            Switch to Full tree
          </button>
        ) : null}
      </div>
    </div>
  );
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

function kindShort(kind: FileChange["kind"]): string {
  switch (kind) {
    case "added":
      return "+";
    case "deleted":
      return "−";
    case "modified":
      return "M";
    case "renamed":
      return "R";
    case "untracked":
      return "?";
    case "binary":
      return "B";
  }
}

function kindTone(
  kind: FileChange["kind"],
): "added" | "removed" | "modified" | "renamed" | "neutral" {
  switch (kind) {
    case "added":
    case "untracked":
      return "added";
    case "deleted":
      return "removed";
    case "renamed":
      return "renamed";
    case "binary":
      return "neutral";
    case "modified":
      return "modified";
  }
}

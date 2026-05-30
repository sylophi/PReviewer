import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { FileChange } from "@shared/schemas";
import { useSetReviewed } from "@/hooks/diffs/useDiffs";
import { Segmented } from "../ui/segmented";
import { buildTree, collectFolderPaths, flattenTree } from "./fileTree";
import { TreeFileRow, TreeFolderRow } from "./TreeRow";

export type TreeMode = "changed" | "full";

export function FileTreePanel({
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
      className="flex shrink-0 flex-col bg-card/30"
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

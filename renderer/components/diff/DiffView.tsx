import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import type { Worktree } from "@shared/schemas";
import { useResolvedDiff } from "@/hooks/diffs/useDiffs";
import { useFullFileTree } from "@/hooks/diffs/useFullFileTree";
import { useWorktrees } from "@/hooks/repos/useWorktrees";
import { diffTitle } from "@shared/refExpr";
import { DiffHeader } from "./DiffHeader";
import { DiffTabBody } from "./DiffTabBody";
import { EmptyChangesHint } from "./EmptyChangesHint";
import { ErrorState } from "./ErrorState";
import { FileTreePanel, type TreeMode } from "./FileTreePanel";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { ResizeHandle } from "./ResizeHandle";
import { TabStrip, type DiffStyle, type Tab } from "./TabStrip";
import {
  TREE_MAX,
  TREE_MIN,
  TREE_WIDTH_KEY,
  readStoredTreeWidth,
} from "./treeWidth";

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

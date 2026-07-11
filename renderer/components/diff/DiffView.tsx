import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { FileChange, Worktree } from "@shared/schemas";
import { useResolvedDiff, useSetReviewed } from "@/hooks/diffs/useDiffs";
import { useFullFileTree } from "@/hooks/diffs/useFullFileTree";
import { useWorktrees } from "@/hooks/repos/useWorktrees";
import { diffTitle } from "@shared/refExpr";
import { DiffHeader } from "./DiffHeader";
import { DiffTabBody } from "./DiffTabBody";
import { loadDiffSession, saveDiffSession } from "./diffSession";
import { EmptyChangesHint } from "./EmptyChangesHint";
import { ErrorState } from "./ErrorState";
import { FileTreePanel, type TreeMode } from "./FileTreePanel";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { ResizeHandle } from "./ResizeHandle";
import { TabStrip, type DiffStyle, type Tab } from "./TabStrip";
import { useDiffKeyboard } from "./useDiffKeyboard";
import { TREE_MAX, TREE_MIN, TREE_WIDTH_KEY, readStoredTreeWidth } from "./treeWidth";

export function DiffView() {
  const { repoId, diffId } = useParams({ from: "/repos/$repoId/diffs/$diffId" });
  const resolved = useResolvedDiff(repoId, diffId);
  const worktrees = useWorktrees(repoId);
  const navigate = useNavigate();
  const setReviewed = useSetReviewed();

  // View state restores from the per-diff session (localStorage) so
  // navigating away and back — or relaunching the app — lands exactly
  // where the user left off.
  const [session] = useState(() => loadDiffSession(repoId, diffId));
  const [tabs, setTabs] = useState<Tab[]>(session?.tabs ?? []);
  const [activePath, setActivePath] = useState<string | null>(session?.activePath ?? null);
  const [treeMode, setTreeMode] = useState<TreeMode>(session?.treeMode ?? "changed");
  const [treeVisible, setTreeVisible] = useState<boolean>(session?.treeVisible ?? true);
  const [treeWidth, setTreeWidth] = useState<number>(readStoredTreeWidth);
  const fullTree = useFullFileTree(repoId, diffId);

  useEffect(() => {
    saveDiffSession(repoId, diffId, { tabs, activePath, treeMode, treeVisible });
  }, [repoId, diffId, tabs, activePath, treeMode, treeVisible]);

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
    return worktrees.data?.find((w) => w.path === resolved.data!.diff.rightWorktreePath) ?? null;
  }, [resolved.data, worktrees.data]);

  const files = useMemo(() => resolved.data?.files ?? [], [resolved.data]);

  // Paths in the changed-files set route to the DiffEditor; everything
  // else from the full tree opens as a plain Editor.
  const fileByPath = useMemo(() => {
    const m = new Map<string, FileChange>();
    for (const f of files) m.set(f.path, f);
    return m;
  }, [files]);

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
    if (files.length === 0) return;
    const target = files.find((f) => !f.reviewed) ?? files[0];
    if (target) openFile(target.path, "preview");
  }, [files, activePath, openFile]);

  const closeTab = useCallback(
    (path: string) => {
      const idx = tabs.findIndex((t) => t.path === path);
      if (idx < 0) return;
      const next = tabs.toSpliced(idx, 1);
      setTabs(next);
      if (activePath === path) {
        const fallback = next[idx] ?? next[idx - 1] ?? null;
        setActivePath(fallback?.path ?? null);
      }
    },
    [tabs, activePath],
  );

  // ----- keyboard actions -------------------------------------------------

  // Files after the active one (wrapping) that aren't reviewed yet; the
  // reading order the review loop advances through.
  const nextUnreviewedAfter = useCallback(
    (fromPath: string | null): FileChange | null => {
      if (files.length === 0) return null;
      const idx = fromPath ? files.findIndex((f) => f.path === fromPath) : -1;
      const ordered = [...files.slice(idx + 1), ...files.slice(0, Math.max(idx, 0))];
      return ordered.find((f) => !f.reviewed && f.path !== fromPath) ?? null;
    },
    [files],
  );

  const stepTab = useCallback(
    (delta: number) => {
      if (tabs.length === 0) return;
      const idx = tabs.findIndex((t) => t.path === activePath);
      const next = tabs[(idx + delta + tabs.length) % tabs.length];
      if (next) setActivePath(next.path);
    },
    [tabs, activePath],
  );

  useDiffKeyboard({
    toggleReviewedAndAdvance: () => {
      const active = activePath ? (fileByPath.get(activePath) ?? null) : null;
      if (!active) return;
      const marking = !active.reviewed;
      setReviewed.mutate({ repoId, diffId, path: active.path, reviewed: marking });
      if (marking) {
        const next = nextUnreviewedAfter(active.path);
        if (next) openFile(next.path, "preview");
      }
    },
    jumpToNextUnreviewed: () => {
      const next = nextUnreviewedAfter(activePath);
      if (next) openFile(next.path, "preview");
    },
    nextTab: () => stepTab(1),
    prevTab: () => stepTab(-1),
    activateTabIndex: (i) => {
      const tab = tabs[i];
      if (tab) setActivePath(tab.path);
    },
    closeActiveTab: () => {
      if (activePath === null) return false;
      closeTab(activePath);
      return true;
    },
    toggleDiffStyle: () => {
      if (!activePath) return;
      const tab = tabs.find((t) => t.path === activePath);
      if (tab) setTabDiffStyle(activePath, tab.diffStyle === "split" ? "inline" : "split");
    },
    toggleTree: () => setTreeVisible((v) => !v),
    goToDashboard: () => void navigate({ to: "/" }),
  });

  // -------------------------------------------------------------------------

  const diffName = resolved.data
    ? (resolved.data.diff.name ?? diffTitle(resolved.data.diff.left, resolved.data.diff.right))
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DiffHeader
        repoId={repoId}
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
            {treeVisible ? (
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
              </>
            ) : null}
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
                    diffStyle={tabs.find((t) => t.path === activePath)?.diffStyle ?? "split"}
                    file={fileByPath.get(activePath) ?? null}
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

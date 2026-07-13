// Per-diff view state persisted to localStorage so returning to a diff
// (after navigating to the dashboard, or in a fresh app session)
// restores the open tabs, active file, and tree mode. "Never lose your
// place" is the product's core promise; component state alone loses it
// on every unmount.
import type { TreeMode } from "./FileTreePanel";
import type { Tab } from "./TabStrip";

export interface DiffSession {
  tabs: Tab[];
  activePath: string | null;
  treeMode: TreeMode;
  treeVisible: boolean;
}

function sessionKey(repoId: string, diffId: string): string {
  return `previewer.diffSession.${repoId}:${diffId}`;
}

function isTab(t: unknown): t is Tab {
  if (typeof t !== "object" || t === null) return false;
  const tab = t as Record<string, unknown>;
  return (
    typeof tab.path === "string" &&
    tab.path.length > 0 &&
    typeof tab.preview === "boolean" &&
    (tab.diffStyle === "split" || tab.diffStyle === "inline")
  );
}

export function loadDiffSession(repoId: string, diffId: string): DiffSession | null {
  try {
    const raw = window.localStorage.getItem(sessionKey(repoId, diffId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(parsed.tabs)) return null;
    const tabs = parsed.tabs.filter(isTab);
    const activePath =
      typeof parsed.activePath === "string" && tabs.some((t) => t.path === parsed.activePath)
        ? parsed.activePath
        : (tabs[0]?.path ?? null);
    return {
      tabs,
      activePath,
      treeMode: parsed.treeMode === "full" ? "full" : "changed",
      treeVisible: parsed.treeVisible !== false,
    };
  } catch {
    return null;
  }
}

export function saveDiffSession(repoId: string, diffId: string, session: DiffSession): void {
  try {
    window.localStorage.setItem(sessionKey(repoId, diffId), JSON.stringify(session));
  } catch {
    // localStorage may be unavailable or full; losing session restore
    // is not fatal.
  }
}

export function clearDiffSession(repoId: string, diffId: string): void {
  try {
    window.localStorage.removeItem(sessionKey(repoId, diffId));
  } catch {
    // Best-effort.
  }
}

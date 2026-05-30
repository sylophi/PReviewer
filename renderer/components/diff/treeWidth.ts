// File-tree rail is user-resizable, with the width persisted across
// sessions. Mirrors shigomori's sidebar pattern (state in the parent,
// resize handle as a sibling of the aside, mousedown installs document-
// level listeners). Clamped to MIN/MAX to keep the rail usable.
export const TREE_WIDTH_KEY = "diffView.fileTreeWidth";
export const TREE_MIN = 200;
export const TREE_MAX = 600;
export const TREE_DEFAULT = 272;

export function readStoredTreeWidth(): number {
  try {
    const raw = window.localStorage.getItem(TREE_WIDTH_KEY);
    const n = raw ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isFinite(n)) return TREE_DEFAULT;
    return Math.min(TREE_MAX, Math.max(TREE_MIN, n));
  } catch {
    return TREE_DEFAULT;
  }
}

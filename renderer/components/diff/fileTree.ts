import type { FileChange } from "@shared/schemas";

export type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; file: FileChange | null };

export type TreeRowInput =
  | { kind: "changed"; file: FileChange }
  | { kind: "plain"; path: string };

export type TreeFolder = Extract<TreeNode, { kind: "folder" }>;
export type TreeFile = Extract<TreeNode, { kind: "file" }>;

export type FlatRow =
  | { kind: "folder"; node: TreeFolder; depth: number; key: string }
  | { kind: "file"; node: TreeFile; depth: number; key: string };

// Walk the tree producing a flat list of currently-visible rows, given
// which folders are collapsed. Root folder is skipped (it has no row);
// its children sit at depth 0. Used by the virtualizer.
export function flattenTree(root: TreeFolder, collapsed: Set<string>): FlatRow[] {
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
export function collectFolderPaths(root: TreeFolder): string[] {
  const out: string[] = [];
  function walk(node: TreeNode): void {
    if (node.kind !== "folder") return;
    if (node.path) out.push(node.path);
    for (const child of node.children) walk(child);
  }
  walk(root);
  return out;
}

export function buildTree(rows: TreeRowInput[]): TreeFolder {
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

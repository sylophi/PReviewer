// Helpers that combine the diff's persisted state (pin + reviewed map)
// with live git lookups. Kept out of the IPC layer so handlers stay
// thin and the heavy lifting is reusable.
import type { Diff, FileChange, RefExpr } from "@shared/schemas";
import { blobHashAtPath, blobHashesAtCommit, blobHashesAtWorkingTree } from "./hashes";
import { tryResolveOrNull } from "./refs";

// A pinned diff swaps the live ref for the frozen commit hash. The
// working-tree side has no commit to pin against, so it stays live.
export function freezeRef(ref: RefExpr, frozenHash: string | null | undefined): RefExpr {
  if (!frozenHash) return ref;
  if (ref.kind === "workingTree") return ref;
  return { kind: "commit", hash: frozenHash };
}

export async function enrichWithReviewed(
  cwd: string,
  diff: Diff,
  rightCommit: string | null,
  files: FileChange[],
): Promise<FileChange[]> {
  if (files.length === 0) return files;
  const hashByPath = await rightSideHashes(cwd, rightCommit, files);
  return files.map((f) => {
    const stored = diff.reviewed[f.path];
    if (!stored) return { ...f, reviewed: false, needsReReview: false };
    const currentHash = hashByPath.get(f.path) ?? null;
    const needsReReview =
      stored.hash.length > 0 && currentHash !== null && stored.hash !== currentHash;
    return { ...f, reviewed: true, needsReReview };
  });
}

async function rightSideHashes(
  cwd: string,
  rightCommit: string | null,
  files: FileChange[],
): Promise<Map<string, string>> {
  // Deleted files have no right-side blob; skip them so ls-tree /
  // hash-object don't waste a call complaining about missing paths.
  const livePaths = files.filter((f) => f.kind !== "deleted").map((f) => f.path);
  if (livePaths.length === 0) return new Map();
  if (rightCommit !== null) {
    return blobHashesAtCommit(cwd, rightCommit, livePaths);
  }
  return blobHashesAtWorkingTree(cwd, livePaths);
}

// Single-file lookup for the mark-reviewed mutation.
export async function rightSideHashForPath(
  cwd: string,
  right: RefExpr,
  path: string,
): Promise<string | null> {
  if (right.kind === "workingTree") {
    const map = await blobHashesAtWorkingTree(cwd, [path]);
    return map.get(path) ?? null;
  }
  if (right.kind === "commit") {
    return blobHashAtPath(cwd, right.hash, path);
  }
  const commit = await tryResolveOrNull(cwd, right);
  if (!commit) return null;
  return blobHashAtPath(cwd, commit, path);
}

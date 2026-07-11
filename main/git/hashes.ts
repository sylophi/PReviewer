// Compute git blob hashes for the right side of a diff, used to detect
// "this file changed since you marked it reviewed."
import { access } from "node:fs/promises";
import { join } from "node:path";
import { run, runLenient } from "./core";

// SHA-1 repos produce 40-hex ids, SHA-256 repos 64-hex.
const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

// Single blob SHA via git rev-parse <commit>:<path>. Cheaper than
// pulling the entire tree when you only need one file.
export async function blobHashAtPath(
  cwd: string,
  commit: string,
  path: string,
): Promise<string | null> {
  const out = await runLenient(cwd, ["rev-parse", `${commit}:${path}`]);
  const trimmed = out.trim();
  // rev-parse prints the error string on stderr but our lenient wrapper
  // captures only stdout; an empty result means the path didn't exist.
  return OBJECT_ID.test(trimmed) ? trimmed : null;
}

const LS_TREE_CHUNK = 500;

// Map<path, blob sha> at a specific commit, scoped to the given paths.
export async function blobHashesAtCommit(
  cwd: string,
  commit: string,
  paths: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  for (let i = 0; i < paths.length; i += LS_TREE_CHUNK) {
    const chunk = paths.slice(i, i + LS_TREE_CHUNK);
    const out = await run(cwd, ["ls-tree", "-r", "-z", commit, "--", ...chunk]);
    for (const record of out.split("\0")) {
      if (!record) continue;
      const [meta, path] = record.split("\t");
      if (!meta || !path) continue;
      const parts = meta.split(" ");
      if (parts.length >= 3) map.set(path, parts[2]);
    }
  }
  return map;
}

const HASH_CHUNK = 500;

// Map<path, blob sha> for an arbitrary set of working-tree files.
// Filters to files that still exist first: the diff's file list is a
// snapshot, and a file deleted between diffing and hashing would
// otherwise make `git hash-object` fail the whole batch (and shift the
// positional line-to-path mapping).
export async function blobHashesAtWorkingTree(
  cwd: string,
  paths: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const existing = (
    await Promise.all(
      paths.map(async (p) => {
        try {
          await access(join(cwd, p));
          return p;
        } catch {
          return null;
        }
      }),
    )
  ).filter((p): p is string => p !== null);
  for (let i = 0; i < existing.length; i += HASH_CHUNK) {
    const chunk = existing.slice(i, i + HASH_CHUNK);
    let hashes: string[];
    try {
      const stdout = await run(cwd, ["hash-object", "--", ...chunk]);
      hashes = stdout.split("\n").filter(Boolean);
      if (hashes.length !== chunk.length) {
        // Positional mapping is only safe when counts line up exactly.
        hashes = await hashOneByOne(cwd, chunk);
      }
    } catch {
      hashes = await hashOneByOne(cwd, chunk);
    }
    chunk.forEach((path, idx) => {
      const h = hashes[idx];
      if (h) map.set(path, h);
    });
  }
  return map;
}

// Per-file fallback when a batch fails (e.g. a file vanished between
// the existence check and the hash). Missing files map to "".
async function hashOneByOne(cwd: string, paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    const h = (await runLenient(cwd, ["hash-object", "--", p])).trim();
    out.push(OBJECT_ID.test(h) ? h : "");
  }
  return out;
}

// Hash AND persist a working-tree file's blob into the object database
// (`hash-object -w`). Used when marking a file reviewed: the stored
// hash then stays recoverable for the "changes since review" view even
// after the working tree moves on. The blob is unreferenced, so git gc
// can prune it after gc.pruneExpire (2 weeks by default) — readBlob
// callers must tolerate a missing object.
export async function writeBlobFromWorkingTree(cwd: string, path: string): Promise<string | null> {
  const out = await runLenient(cwd, ["hash-object", "-w", "--", path]);
  const trimmed = out.trim();
  return OBJECT_ID.test(trimmed) ? trimmed : null;
}

// Blob content by hash, or null when the object doesn't exist (pruned,
// or the mark predates snapshot support).
export async function readBlob(cwd: string, hash: string): Promise<string | null> {
  if (!OBJECT_ID.test(hash)) return null;
  try {
    return await run(cwd, ["cat-file", "blob", hash]);
  } catch {
    return null;
  }
}

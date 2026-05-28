// Compute git blob hashes for the right side of a diff, used to detect
// "this file changed since you marked it reviewed."
import { run, runLenient } from "./core";

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
  return trimmed.length === 40 ? trimmed : null;
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
export async function blobHashesAtWorkingTree(
  cwd: string,
  paths: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let i = 0; i < paths.length; i += HASH_CHUNK) {
    const chunk = paths.slice(i, i + HASH_CHUNK);
    const stdout = await run(cwd, ["hash-object", "--", ...chunk]);
    const hashes = stdout.split("\n").filter(Boolean);
    chunk.forEach((path, idx) => {
      const h = hashes[idx];
      if (h) map.set(path, h);
    });
  }
  return map;
}

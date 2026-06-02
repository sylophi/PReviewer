// List every tracked file at a given commit (or untracked, when the
// caller wants the full working tree). Drives the "full tree" mode of
// the file tree panel so the user can browse unchanged files alongside
// the diff.
import type { RefExpr } from "@shared/schemas";
import { run, runLenient } from "./core";
import { tryResolveOrNull } from "./refs";

export async function fullFileTree(cwd: string, rightSide: RefExpr): Promise<string[]> {
  if (rightSide.kind === "workingTree") {
    return treeFromWorkingTree(cwd);
  }
  const commit = await tryResolveOrNull(cwd, rightSide);
  if (!commit) return [];
  return treeFromCommit(cwd, commit);
}

async function treeFromCommit(cwd: string, commit: string): Promise<string[]> {
  const out = await run(cwd, ["ls-tree", "-r", "--name-only", "-z", commit]);
  return out.split("\0").filter(Boolean);
}

async function treeFromWorkingTree(cwd: string): Promise<string[]> {
  const [tracked, untracked] = await Promise.all([
    runLenient(cwd, ["ls-files", "-z"]),
    runLenient(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const all = [...tracked.split("\0").filter(Boolean), ...untracked.split("\0").filter(Boolean)];
  // Dedupe; the two listings shouldn't overlap by definition, but cheap
  // insurance against future ls-files flag changes.
  return [...new Set(all)];
}

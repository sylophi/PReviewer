// Resolve any RefExpr to a concrete commit hash. The workingTree case
// has no committish; callers that need one must handle it separately.
import type { RefExpr } from "@shared/schemas";
import { run, runLenient } from "./core";

export class WorkingTreeHasNoCommitError extends Error {
  constructor() {
    super("workingTree has no commit hash; handle it before resolving");
    this.name = "WorkingTreeHasNoCommitError";
  }
}

export async function resolveRefToCommit(cwd: string, ref: RefExpr): Promise<string> {
  switch (ref.kind) {
    case "commit":
      return revParse(cwd, ref.hash);
    case "branch":
      return revParse(cwd, ref.name);
    case "head":
      return revParse(cwd, "HEAD");
    case "mergeBase": {
      const [a, b] = await Promise.all([
        resolveRefToCommit(cwd, ref.a),
        resolveRefToCommit(cwd, ref.b),
      ]);
      return mergeBase(cwd, a, b);
    }
    case "workingTree":
      throw new WorkingTreeHasNoCommitError();
  }
}

async function revParse(cwd: string, rev: string): Promise<string> {
  const out = await run(cwd, ["rev-parse", "--verify", rev]);
  return out.trim();
}

async function mergeBase(cwd: string, a: string, b: string): Promise<string> {
  const out = await run(cwd, ["merge-base", a, b]);
  return out.trim();
}

export async function listLocalBranches(cwd: string): Promise<string[]> {
  const out = await run(cwd, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"]);
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function listRemoteBranches(cwd: string): Promise<string[]> {
  const out = await run(cwd, ["for-each-ref", "--format=%(refname:short)", "refs/remotes/"]);
  return (
    out
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      // origin/HEAD is a symbolic ref pointing at another branch; useless
      // as a picker entry.
      .filter((b) => !b.endsWith("/HEAD"))
  );
}

export async function currentBranch(cwd: string): Promise<string | null> {
  const out = await runLenient(cwd, ["symbolic-ref", "--short", "HEAD"]);
  const trimmed = out.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface RecentCommit {
  hash: string;
  shortHash: string;
  subject: string;
}

// git log with NUL-delimited fields. -50 keeps the picker fast and
// covers the typical "recent work" window.
export async function listRecentCommits(cwd: string): Promise<RecentCommit[]> {
  const out = await runLenient(cwd, ["log", "-50", "--no-merges", "--format=%H%x1f%h%x1f%s%x1e"]);
  return out
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, shortHash, subject] = entry.split("\x1f");
      return { hash, shortHash, subject };
    });
}

export async function tryResolveOrNull(cwd: string, ref: RefExpr): Promise<string | null> {
  if (ref.kind === "workingTree") return null;
  try {
    return await resolveRefToCommit(cwd, ref);
  } catch (err) {
    if (err instanceof WorkingTreeHasNoCommitError) return null;
    throw err;
  }
}

// git's well-known empty tree object; always present in every repo.
// Diffing against it renders "everything is new".
export const EMPTY_TREE_HASH = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// True when the repo has a HEAD symref but no commit behind it — a
// freshly `git init`ed repo (or an orphan branch before its first
// commit). rev-parse HEAD fails there even though the repo is healthy.
async function isUnbornHead(cwd: string): Promise<boolean> {
  const symref = (await runLenient(cwd, ["symbolic-ref", "-q", "HEAD"])).trim();
  if (symref.length === 0) return false;
  const resolved = (await runLenient(cwd, ["rev-parse", "--verify", "-q", "HEAD"])).trim();
  return resolved.length === 0;
}

// Like tryResolveOrNull, but maps the unborn-HEAD case (head, or the
// branch HEAD points at before its first commit) to the empty tree so
// a "working tree ↔ HEAD" diff in a brand-new repo shows every file as
// added instead of throwing. Genuine bad refs still throw.
export async function resolveForDiff(cwd: string, ref: RefExpr): Promise<string | null> {
  try {
    return await tryResolveOrNull(cwd, ref);
  } catch (err) {
    if ((ref.kind === "head" || ref.kind === "branch") && (await isUnbornHead(cwd))) {
      if (ref.kind === "head") return EMPTY_TREE_HASH;
      const symref = (await runLenient(cwd, ["symbolic-ref", "-q", "HEAD"])).trim();
      if (symref === `refs/heads/${ref.name}`) return EMPTY_TREE_HASH;
    }
    throw err;
  }
}

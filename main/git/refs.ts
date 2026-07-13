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

// The empty tree object, which every repo can name. Diffing against it
// renders "everything is new". The id is hash-algorithm dependent (the
// familiar 4b825dc6… is the SHA-1 one; SHA-256 repos have a different,
// 64-hex id), so ask git rather than hardcoding it. Cached per repo:
// it's immutable for a given object format.
const emptyTreeCache = new Map<string, string>();

async function emptyTreeHash(cwd: string): Promise<string> {
  const cached = emptyTreeCache.get(cwd);
  if (cached !== undefined) return cached;
  // Hashing /dev/null as a tree yields the empty tree in the repo's own
  // object format, without writing anything.
  const hash = (await run(cwd, ["hash-object", "-t", "tree", "/dev/null"])).trim();
  emptyTreeCache.set(cwd, hash);
  return hash;
}

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
      if (ref.kind === "head") return emptyTreeHash(cwd);
      const symref = (await runLenient(cwd, ["symbolic-ref", "-q", "HEAD"])).trim();
      if (symref === `refs/heads/${ref.name}`) return emptyTreeHash(cwd);
    }
    throw err;
  }
}

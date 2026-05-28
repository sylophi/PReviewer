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

export class PrRefsNotImplementedError extends Error {
  constructor() {
    super("pr ref expressions are resolved by the gh-cli layer");
    this.name = "PrRefsNotImplementedError";
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
    case "pr":
      throw new PrRefsNotImplementedError();
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
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    // origin/HEAD is a symbolic ref pointing at another branch; useless
    // as a picker entry.
    .filter((b) => !b.endsWith("/HEAD"));
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

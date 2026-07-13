import type { PullRequestSummary, RefExpr, Worktree } from "./schemas";

// The worktree that has this PR's head branch checked out, if any.
// Reviewing that PR then reads the live checkout instead of a frozen
// SHA. Fork PRs are excluded on purpose: their head branch name is
// scoped to the fork, so a local branch that happens to share the name
// ("main", "patch-1", …) is unrelated code and matching it would review
// the wrong files under the PR's title. Shared by the main process
// (which binds the diff) and the renderer (which shows the chip) so the
// two can't disagree about what counts as "checked out".
export function worktreeForPullRequest<W extends Worktree>(
  worktrees: readonly W[],
  pr: Pick<PullRequestSummary, "headRefName" | "isCrossRepository">,
): W | null {
  if (pr.isCrossRepository) return null;
  return worktrees.find((w) => w.branch === pr.headRefName) ?? null;
}

export function labelForRef(ref: RefExpr): string {
  switch (ref.kind) {
    case "branch":
      return ref.name;
    case "commit":
      return ref.hash.slice(0, 7);
    case "head":
      return "HEAD";
    case "workingTree":
      return "working tree";
    case "mergeBase":
      return `merge-base(${labelForRef(ref.a)}, ${labelForRef(ref.b)})`;
  }
}

export function diffTitle(left: RefExpr, right: RefExpr): string {
  return `${labelForRef(left)} ↔ ${labelForRef(right)}`;
}

// Central registry of TanStack Query keys. Every queryKey in the
// renderer should come from here so renames and prefix-based
// invalidations are auditable in one place. Keys are namespaced by
// domain; shared prefixes let one invalidateQueries call cascade
// through everything in that subtree (e.g. all diff data for a repo).
export const queryKeys = {
  repos: () => ["repos"] as const,
  repoBranches: (repoId: string | null) =>
    ["repos", repoId, "branches"] as const,
  repoWorktrees: (repoId: string | null) =>
    ["repos", repoId, "worktrees"] as const,
  repoRecentCommits: (repoId: string | null) =>
    ["repos", repoId, "recentCommits"] as const,

  // All diff-related keys share the ["diffs", repoId] prefix so a
  // single invalidate cascades across list + per-diff + resolved +
  // readFile + fullTree.
  diffsForRepo: (repoId: string) => ["diffs", repoId] as const,
  diff: (repoId: string, diffId: string) =>
    ["diffs", repoId, diffId] as const,
  resolvedDiff: (repoId: string, diffId: string) =>
    ["diffs", repoId, diffId, "resolved"] as const,
  fullFileTree: (repoId: string, diffId: string) =>
    ["diffs", repoId, diffId, "fullTree"] as const,
  readFile: (
    repoId: string,
    diffId: string,
    path: string | null,
    side: "left" | "right",
  ) => ["diffs", repoId, diffId, "readFile", path, side] as const,

  gh: () => ["gh"] as const,
  ghReadiness: () => ["gh", "readiness"] as const,
  ghPullRequests: (repoId: string | null) =>
    ["gh", "prList", repoId] as const,

  fsListDirectory: (path: string) =>
    ["fs", "listDirectory", path] as const,
  fsIsGitRepo: (path: string) => ["fs", "isGitRepo", path] as const,
} as const;

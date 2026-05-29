// Thin wrappers around the git CLI. Each file owns one slice.
export { getOriginUrl, isGitRepo, run, runLenient } from "./core";
export {
  currentBranch,
  listLocalBranches,
  listRecentCommits,
  listRemoteBranches,
  PrRefsNotImplementedError,
  resolveRefToCommit,
  tryResolveOrNull,
  WorkingTreeHasNoCommitError,
} from "./refs";
export type { RecentCommit } from "./refs";
export { fileListFromRefs, resolveAndDiff } from "./diff";
export type { ResolvedSides } from "./diff";
export { fullFileTree } from "./tree";
export { blobHashAtPath, blobHashesAtCommit, blobHashesAtWorkingTree } from "./hashes";
export { enrichWithReviewed, freezeRef, rightSideHashForPath } from "./reviewed";
export { readFileAtRef, rightSideIsLive, writeFileToWorkingTree } from "./files";
export { listWorktrees } from "./worktrees";
export type { Worktree } from "./worktrees";

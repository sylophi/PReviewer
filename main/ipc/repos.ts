import { reposContract } from "@shared/ipc/modules/repos";
import type { Handlers } from "@shared/ipc/types";
import { addRepo, findRepoOrThrow, listRepos, removeRepo } from "../config/repos";
import {
  currentBranch,
  listLocalBranches,
  listRecentCommits,
  listRemoteBranches,
} from "../git/refs";
import { listWorktrees } from "../git/worktrees";
import { toAbsolute } from "../util/paths";

export const reposHandlers: Handlers<typeof reposContract> = {
  list: () => listRepos(),
  add: ({ path }) => addRepo(toAbsolute(path)),
  remove: async ({ id }) => {
    await removeRepo(id);
  },
  branches: async ({ repoId }) => {
    const repo = await findRepoOrThrow(repoId);
    const [local, remote, head] = await Promise.all([
      listLocalBranches(repo.path),
      listRemoteBranches(repo.path),
      currentBranch(repo.path),
    ]);
    return { local, remote, currentBranch: head };
  },
  recentCommits: async ({ repoId }) => {
    const repo = await findRepoOrThrow(repoId);
    return listRecentCommits(repo.path);
  },
  worktrees: async ({ repoId }) => {
    const repo = await findRepoOrThrow(repoId);
    return listWorktrees(repo.path);
  },
};

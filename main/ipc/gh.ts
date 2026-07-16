import { ghContract } from "@shared/ipc/modules/gh";
import type { Handlers } from "@shared/ipc/types";
import { findRepoOrThrow } from "../config/repos";
import { ghReadiness } from "../githubCli/readiness";
import { listPullRequests } from "../githubCli/pullRequests";

export const ghHandlers: Handlers<typeof ghContract> = {
  readiness: () => ghReadiness(),
  listPullRequests: async ({ repoId }) => {
    const repo = await findRepoOrThrow(repoId);
    return listPullRequests(repo.path);
  },
};

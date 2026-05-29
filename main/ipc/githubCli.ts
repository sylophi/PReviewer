import { ipcMain } from "electron";
import { CHANNELS } from "@shared/channels";
import {
  type GhReadiness,
  ListPullRequestsPayloadSchema,
  type PullRequestSummary,
} from "@shared/schemas";
import { findRepoOrThrow } from "../config/repos";
import { ghReadiness, listPullRequests } from "../githubCli";

export function registerGithubCliHandlers(): void {
  ipcMain.handle(CHANNELS.GhReadiness, (): Promise<GhReadiness> => ghReadiness());

  ipcMain.handle(
    CHANNELS.GhListPullRequests,
    async (_event, rawPayload: unknown): Promise<PullRequestSummary[]> => {
      const { repoId } = ListPullRequestsPayloadSchema.parse(rawPayload);
      const repo = await findRepoOrThrow(repoId);
      return listPullRequests(repo.path);
    },
  );
}

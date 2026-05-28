import { ipcMain } from "electron";
import { CHANNELS } from "@shared/channels";
import { AddRepoPayloadSchema, RemoveRepoPayloadSchema, type Repo } from "@shared/schemas";
import { addRepo, listRepos, removeRepo } from "../config/repos";
import { toAbsolute } from "../util/paths";

export function registerReposHandlers(): void {
  ipcMain.handle(CHANNELS.ReposList, (): Promise<Repo[]> => listRepos());

  ipcMain.handle(CHANNELS.ReposAdd, async (_event, rawPayload: unknown): Promise<Repo> => {
    const { path } = AddRepoPayloadSchema.parse(rawPayload);
    return addRepo(toAbsolute(path));
  });

  ipcMain.handle(CHANNELS.ReposRemove, async (_event, rawPayload: unknown): Promise<void> => {
    const { id } = RemoveRepoPayloadSchema.parse(rawPayload);
    await removeRepo(id);
  });
}

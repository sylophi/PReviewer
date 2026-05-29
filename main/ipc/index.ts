import { registerDiffHandlers } from "./diffs";
import { registerFsHandlers } from "./fs";
import { registerGithubCliHandlers } from "./githubCli";
import { registerReposHandlers } from "./repos";
import { registerRuntimeHandlers } from "./runtime";

export function registerIpcHandlers(): void {
  registerRuntimeHandlers();
  registerFsHandlers();
  registerReposHandlers();
  registerDiffHandlers();
  registerGithubCliHandlers();
}

import { registerDiffHandlers } from "./diffs";
import { registerFsHandlers } from "./fs";
import { registerReposHandlers } from "./repos";
import { registerRuntimeHandlers } from "./runtime";

export function registerIpcHandlers(): void {
  registerRuntimeHandlers();
  registerFsHandlers();
  registerReposHandlers();
  registerDiffHandlers();
}

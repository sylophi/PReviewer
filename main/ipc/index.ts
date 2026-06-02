import { dialogContract } from "@shared/ipc/modules/dialog";
import { diffsContract } from "@shared/ipc/modules/diffs";
import { fsContract } from "@shared/ipc/modules/fs";
import { ghContract } from "@shared/ipc/modules/gh";
import { globalConfigContract } from "@shared/ipc/modules/globalConfig";
import { reposContract } from "@shared/ipc/modules/repos";
import { runtimeContract } from "@shared/ipc/modules/runtime";
import { shellContract } from "@shared/ipc/modules/shell";
import { dialogHandlers } from "./dialog";
import { diffsHandlers } from "./diffs";
import { fsHandlers } from "./fs";
import { ghHandlers } from "./gh";
import { globalConfigHandlers } from "./globalConfig";
import { registerContract } from "./register";
import { reposHandlers } from "./repos";
import { runtimeHandlers } from "./runtime";
import { shellHandlers } from "./shell";

export function registerIpcHandlers(): void {
  registerContract(runtimeContract, runtimeHandlers);
  registerContract(fsContract, fsHandlers);
  registerContract(dialogContract, dialogHandlers);
  registerContract(reposContract, reposHandlers);
  registerContract(diffsContract, diffsHandlers);
  registerContract(ghContract, ghHandlers);
  registerContract(globalConfigContract, globalConfigHandlers);
  registerContract(shellContract, shellHandlers);
}

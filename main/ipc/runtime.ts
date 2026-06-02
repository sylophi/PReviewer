import { app, nativeTheme } from "electron";
import { homedir } from "node:os";
import { runtimeContract } from "@shared/ipc/modules/runtime";
import type { Handlers } from "@shared/ipc/types";
import { previewRoot } from "../util/paths";

export const runtimeHandlers: Handlers<typeof runtimeContract> = {
  info: () => ({
    homedir: homedir(),
    isDev: !app.isPackaged,
    configRoot: previewRoot(),
  }),
  // Track the renderer's applied theme so the NSVisualEffectView material
  // follows the in-app appearance, not the OS one.
  setTheme: ({ theme }) => {
    nativeTheme.themeSource = theme;
  },
};

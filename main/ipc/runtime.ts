import { app, ipcMain, nativeTheme } from "electron";
import { homedir } from "node:os";
import { CHANNELS } from "@shared/channels";
import { type RuntimeInfo, SetThemePayloadSchema } from "@shared/schemas";

export function registerRuntimeHandlers(): void {
  ipcMain.handle(
    CHANNELS.RuntimeInfo,
    (): RuntimeInfo => ({
      homedir: homedir(),
      isDev: !app.isPackaged,
    }),
  );

  // Track the renderer's applied theme so the NSVisualEffectView material
  // follows the in-app appearance, not the OS one.
  ipcMain.handle(CHANNELS.RuntimeSetTheme, (_event, rawPayload: unknown) => {
    const { theme } = SetThemePayloadSchema.parse(rawPayload);
    nativeTheme.themeSource = theme;
  });
}

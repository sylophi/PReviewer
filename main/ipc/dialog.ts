import { BrowserWindow, dialog } from "electron";
import { dialogContract } from "@shared/ipc/modules/dialog";
import type { Handlers } from "@shared/ipc/types";
import type { HandlerContext } from "./register";

export const dialogHandlers: Handlers<typeof dialogContract, HandlerContext> = {
  pickFolder: async (opts, { event }) => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
      title: opts?.title ?? "Pick a folder",
      buttonLabel: opts?.buttonLabel ?? "Pick",
    };
    const result = focusedWindow
      ? await dialog.showOpenDialog(focusedWindow, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  },
};

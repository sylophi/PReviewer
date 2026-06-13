import { app, BrowserWindow, nativeTheme } from "electron";
import path from "node:path";
import { windowContract } from "@shared/ipc/modules/window";
import { ensurePReviewerRoot } from "./app/bootstrap";
import { applyUserShellPath } from "./app/shellPath";
import { readThemeSync } from "./config/global";
import { registerIpcHandlers } from "./ipc";
import { broadcast } from "./ipc/register";

registerIpcHandlers();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  // Drive AppKit appearance from the saved theme before constructing
  // the window so the NSVisualEffectView material under `vibrancy`
  // picks the right light/dark variant on first paint.
  nativeTheme.themeSource = readThemeSync();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: "#00000000",
    vibrancy: "sidebar",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  const sendFocus = () => {
    if (mainWindow) broadcast(windowContract, "focused", undefined, mainWindow.webContents);
  };
  const sendBlur = () => {
    if (mainWindow) broadcast(windowContract, "blurred", undefined, mainWindow.webContents);
  };
  mainWindow.on("focus", sendFocus);
  mainWindow.on("blur", sendBlur);
}

app.on("ready", async () => {
  // Packaged macOS launches inherit launchd's stripped PATH, which omits
  // Homebrew and other user additions where git/gh live. Capture the
  // interactive shell PATH first so every git/gh child process resolves.
  // Dev launches start from the terminal and already have the right one.
  if (app.isPackaged) await applyUserShellPath();
  await ensurePReviewerRoot();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

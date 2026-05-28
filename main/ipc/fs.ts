import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { BrowserWindow, dialog, ipcMain } from "electron";
import { CHANNELS } from "@shared/channels";
import {
  type DirectoryListing,
  IsGitRepoPayloadSchema,
  ListDirectoryPayloadSchema,
  PickFolderPayloadSchema,
  ScanForGitReposPayloadSchema,
} from "@shared/schemas";
import { isGitRepo } from "../git";
import { toAbsolute } from "../util/paths";

// Directories that virtually never contain git repos but are huge and
// slow to walk. Skipped during the scan to keep it responsive.
const SCAN_SKIP_DIRS = new Set([
  "node_modules",
  "target",
  "dist",
  "build",
  "vendor",
  "venv",
  ".venv",
  "__pycache__",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
]);

const SCAN_MAX_DEPTH = 6;

async function scanForGitRepos(rootPath: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > SCAN_MAX_DEPTH) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((e) => e.isDirectory() && e.name === ".git")) {
      results.push(dir);
      return;
    }

    const subdirs = entries.filter(
      (e) =>
        e.isDirectory() &&
        !e.isSymbolicLink() &&
        !e.name.startsWith(".") &&
        !SCAN_SKIP_DIRS.has(e.name),
    );

    await Promise.all(subdirs.map((entry) => walk(join(dir, entry.name), depth + 1)));
  }

  await walk(rootPath, 0);
  return results.toSorted();
}

export function registerFsHandlers(): void {
  ipcMain.handle(
    CHANNELS.DialogPickFolder,
    async (event, rawPayload: unknown): Promise<string | null> => {
      const payload = PickFolderPayloadSchema.parse(rawPayload);
      const focusedWindow = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = {
        properties: ["openDirectory", "createDirectory"],
        title: payload?.title ?? "Pick a folder",
        buttonLabel: payload?.buttonLabel ?? "Pick",
      };
      const result = focusedWindow
        ? await dialog.showOpenDialog(focusedWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    },
  );

  ipcMain.handle(CHANNELS.FsIsGitRepo, async (_event, rawPayload: unknown): Promise<boolean> => {
    const { path } = IsGitRepoPayloadSchema.parse(rawPayload);
    return isGitRepo(toAbsolute(path));
  });

  ipcMain.handle(
    CHANNELS.FsListDirectory,
    async (_event, rawPayload: unknown): Promise<DirectoryListing> => {
      const { path } = ListDirectoryPayloadSchema.parse(rawPayload);
      const absolute = toAbsolute(path);

      const entries = await readdir(absolute, { withFileTypes: true });
      const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));
      const isGitRepoFlags = await Promise.all(
        dirs.map(async (e) => {
          try {
            await access(join(absolute, e.name, ".git"));
            return true;
          } catch {
            return false;
          }
        }),
      );
      const result = dirs
        .map((e, i) => ({ name: e.name, isGitRepo: isGitRepoFlags[i] }))
        .toSorted((a, b) => a.name.localeCompare(b.name));

      return { path: absolute, entries: result };
    },
  );

  ipcMain.handle(
    CHANNELS.FsScanForGitRepos,
    async (_event, rawPayload: unknown): Promise<string[]> => {
      const { path } = ScanForGitReposPayloadSchema.parse(rawPayload);
      return scanForGitRepos(toAbsolute(path));
    },
  );
}

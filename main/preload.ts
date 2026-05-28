// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS } from "@shared/channels";
import type {
  Diff,
  DirectoryListing,
  ReadFileResult,
  RecentCommit,
  RefExpr,
  Repo,
  RepoBranches,
  ResolvedDiff,
  RuntimeInfo,
  Theme,
} from "@shared/schemas";

function subscribe<T = void>(channel: string) {
  return (handler: (payload: T) => void): (() => void) => {
    const listener = (_e: unknown, payload: T) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.off(channel, listener);
  };
}

const api = {
  runtime: {
    info: (): Promise<RuntimeInfo> => ipcRenderer.invoke(CHANNELS.RuntimeInfo),
    setTheme: (theme: Theme): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.RuntimeSetTheme, { theme }),
  },
  fs: {
    listDirectory: (path: string): Promise<DirectoryListing> =>
      ipcRenderer.invoke(CHANNELS.FsListDirectory, { path }),
    isGitRepo: (path: string): Promise<boolean> =>
      ipcRenderer.invoke(CHANNELS.FsIsGitRepo, { path }),
    scanForGitRepos: (path: string): Promise<string[]> =>
      ipcRenderer.invoke(CHANNELS.FsScanForGitRepos, { path }),
  },
  dialog: {
    pickFolder: (options?: { title?: string; buttonLabel?: string }): Promise<string | null> =>
      ipcRenderer.invoke(CHANNELS.DialogPickFolder, options),
  },
  repos: {
    list: (): Promise<Repo[]> => ipcRenderer.invoke(CHANNELS.ReposList),
    add: (path: string): Promise<Repo> => ipcRenderer.invoke(CHANNELS.ReposAdd, { path }),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(CHANNELS.ReposRemove, { id }),
    branches: (repoId: string): Promise<RepoBranches> =>
      ipcRenderer.invoke(CHANNELS.ReposBranches, { repoId }),
    recentCommits: (repoId: string): Promise<RecentCommit[]> =>
      ipcRenderer.invoke(CHANNELS.ReposRecentCommits, { repoId }),
  },
  diffs: {
    list: (repoId: string): Promise<Diff[]> => ipcRenderer.invoke(CHANNELS.DiffsList, { repoId }),
    create: (input: {
      repoId: string;
      name?: string;
      left: RefExpr;
      right: RefExpr;
    }): Promise<Diff> => ipcRenderer.invoke(CHANNELS.DiffsCreate, input),
    get: (input: { repoId: string; diffId: string }): Promise<Diff> =>
      ipcRenderer.invoke(CHANNELS.DiffsGet, input),
    delete: (input: { repoId: string; diffId: string }): Promise<void> =>
      ipcRenderer.invoke(CHANNELS.DiffsDelete, input),
    resolve: (input: { repoId: string; diffId: string }): Promise<ResolvedDiff> =>
      ipcRenderer.invoke(CHANNELS.DiffsResolve, input),
    fullTree: (input: { repoId: string; diffId: string }): Promise<string[]> =>
      ipcRenderer.invoke(CHANNELS.DiffsFullTree, input),
    setReviewed: (input: {
      repoId: string;
      diffId: string;
      path: string;
      reviewed: boolean;
    }): Promise<Diff> => ipcRenderer.invoke(CHANNELS.DiffsSetReviewed, input),
    setPin: (input: { repoId: string; diffId: string; pinned: boolean }): Promise<Diff> =>
      ipcRenderer.invoke(CHANNELS.DiffsSetPin, input),
    readFile: (input: {
      repoId: string;
      diffId: string;
      path: string;
      side: "left" | "right";
    }): Promise<ReadFileResult> => ipcRenderer.invoke(CHANNELS.DiffsReadFile, input),
    writeFile: (input: {
      repoId: string;
      diffId: string;
      path: string;
      content: string;
    }): Promise<{ ok: true }> => ipcRenderer.invoke(CHANNELS.DiffsWriteFile, input),
  },
  window: {
    onFocused: subscribe(CHANNELS.WindowFocused),
    onBlurred: subscribe(CHANNELS.WindowBlurred),
  },
} as const;

export type RendererApi = typeof api;

contextBridge.exposeInMainWorld("api", api);

// IPC channel names. Flat and namespaced by domain.
export const CHANNELS = {
  RuntimeInfo: "runtime:info",
  RuntimeSetTheme: "runtime:setTheme",
  WindowFocused: "window:focused",
  WindowBlurred: "window:blurred",
  // Filesystem
  FsListDirectory: "fs:listDirectory",
  FsIsGitRepo: "fs:isGitRepo",
  FsScanForGitRepos: "fs:scanForGitRepos",
  DialogPickFolder: "dialog:pickFolder",
  // Repos
  ReposList: "repos:list",
  ReposAdd: "repos:add",
  ReposRemove: "repos:remove",
  ReposBranches: "repos:branches",
  ReposRecentCommits: "repos:recentCommits",
  // Diffs
  DiffsList: "diffs:list",
  DiffsCreate: "diffs:create",
  DiffsGet: "diffs:get",
  DiffsDelete: "diffs:delete",
  DiffsResolve: "diffs:resolve",
  DiffsFullTree: "diffs:fullTree",
  DiffsSetReviewed: "diffs:setReviewed",
  DiffsSetPin: "diffs:setPin",
  DiffsReadFile: "diffs:readFile",
  DiffsWriteFile: "diffs:writeFile",
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];

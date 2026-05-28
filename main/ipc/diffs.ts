import { ipcMain } from "electron";
import { CHANNELS } from "@shared/channels";
import {
  CreateDiffPayloadSchema,
  type Diff,
  DiffRefPayloadSchema,
  ListDiffsPayloadSchema,
  ReadFilePayloadSchema,
  type ReadFileResult,
  type RecentCommit,
  RecentCommitsPayloadSchema,
  type RepoBranches,
  RepoBranchesPayloadSchema,
  type ResolvedDiff,
  SetPinPayloadSchema,
  SetReviewedPayloadSchema,
  WriteFilePayloadSchema,
} from "@shared/schemas";
import { findRepoOrThrow } from "../config/repos";
import {
  createDiff,
  deleteDiff,
  findDiffOrThrow,
  listDiffs,
  setPin,
  setReviewed,
} from "../config/diffs";
import {
  currentBranch,
  enrichWithReviewed,
  freezeRef,
  fullFileTree,
  listLocalBranches,
  listRecentCommits,
  listRemoteBranches,
  readFileAtRef,
  resolveAndDiff,
  rightSideHashForPath,
  rightSideIsLive,
  tryResolveOrNull,
  writeFileToWorkingTree,
} from "../git";

async function loadDiffContext(repoId: string, diffId: string) {
  const repo = await findRepoOrThrow(repoId);
  const diff = await findDiffOrThrow(repoId, diffId);
  return { repo, diff, cwd: repo.path };
}

async function loadRepoContext(repoId: string) {
  const repo = await findRepoOrThrow(repoId);
  return { repo, cwd: repo.path };
}

export function registerDiffHandlers(): void {
  ipcMain.handle(CHANNELS.DiffsList, async (_event, rawPayload: unknown): Promise<Diff[]> => {
    const { repoId } = ListDiffsPayloadSchema.parse(rawPayload);
    return listDiffs(repoId);
  });

  ipcMain.handle(CHANNELS.DiffsCreate, async (_event, rawPayload: unknown): Promise<Diff> => {
    const input = CreateDiffPayloadSchema.parse(rawPayload);
    await findRepoOrThrow(input.repoId);
    return createDiff(input);
  });

  ipcMain.handle(CHANNELS.DiffsGet, async (_event, rawPayload: unknown): Promise<Diff> => {
    const { repoId, diffId } = DiffRefPayloadSchema.parse(rawPayload);
    return findDiffOrThrow(repoId, diffId);
  });

  ipcMain.handle(CHANNELS.DiffsDelete, async (_event, rawPayload: unknown): Promise<void> => {
    const { repoId, diffId } = DiffRefPayloadSchema.parse(rawPayload);
    await deleteDiff(repoId, diffId);
  });

  ipcMain.handle(
    CHANNELS.DiffsResolve,
    async (_event, rawPayload: unknown): Promise<ResolvedDiff> => {
      const { repoId, diffId } = DiffRefPayloadSchema.parse(rawPayload);
      const { diff, cwd } = await loadDiffContext(repoId, diffId);
      const left = freezeRef(diff.left, diff.pinned?.leftHash);
      const right = freezeRef(diff.right, diff.pinned?.rightHash);
      const sides = await resolveAndDiff(cwd, left, right);
      const files = await enrichWithReviewed(cwd, diff, sides.rightCommit, sides.files);
      return {
        diff,
        leftCommit: sides.leftCommit,
        rightCommit: sides.rightCommit,
        patch: sides.patch,
        files,
      };
    },
  );

  ipcMain.handle(CHANNELS.DiffsSetReviewed, async (_event, rawPayload: unknown): Promise<Diff> => {
    const { repoId, diffId, path, reviewed } = SetReviewedPayloadSchema.parse(rawPayload);
    const { diff, cwd } = await loadDiffContext(repoId, diffId);
    const right = freezeRef(diff.right, diff.pinned?.rightHash);
    const hash = await rightSideHashForPath(cwd, right, path);
    return setReviewed(repoId, diffId, path, reviewed, hash);
  });

  ipcMain.handle(CHANNELS.DiffsSetPin, async (_event, rawPayload: unknown): Promise<Diff> => {
    const { repoId, diffId, pinned } = SetPinPayloadSchema.parse(rawPayload);
    const { diff, cwd } = await loadDiffContext(repoId, diffId);
    if (!pinned) return setPin(repoId, diffId, null);
    const [leftHash, rightHash] = await Promise.all([
      tryResolveOrNull(cwd, diff.left),
      tryResolveOrNull(cwd, diff.right),
    ]);
    return setPin(repoId, diffId, { leftHash, rightHash });
  });

  ipcMain.handle(CHANNELS.DiffsFullTree, async (_event, rawPayload: unknown): Promise<string[]> => {
    const { repoId, diffId } = DiffRefPayloadSchema.parse(rawPayload);
    const { diff, cwd } = await loadDiffContext(repoId, diffId);
    return fullFileTree(cwd, diff.right);
  });

  ipcMain.handle(
    CHANNELS.DiffsReadFile,
    async (_event, rawPayload: unknown): Promise<ReadFileResult> => {
      const { repoId, diffId, path, side } = ReadFilePayloadSchema.parse(rawPayload);
      const { diff, cwd } = await loadDiffContext(repoId, diffId);
      const ref = side === "left" ? diff.left : diff.right;
      const frozenHash = side === "left" ? diff.pinned?.leftHash : diff.pinned?.rightHash;
      const frozen = freezeRef(ref, frozenHash);
      const content = await readFileAtRef(cwd, frozen, path);
      const editable =
        side === "right" && diff.pinned === null && (await rightSideIsLive(cwd, diff.right));
      return { content, editable };
    },
  );

  ipcMain.handle(
    CHANNELS.DiffsWriteFile,
    async (_event, rawPayload: unknown): Promise<{ ok: true }> => {
      const { repoId, diffId, path, content } = WriteFilePayloadSchema.parse(rawPayload);
      const { diff, cwd } = await loadDiffContext(repoId, diffId);
      if (diff.pinned !== null || !(await rightSideIsLive(cwd, diff.right))) {
        throw new Error(
          "This diff isn't editable: its right side isn't the currently checked-out branch, or the diff is pinned.",
        );
      }
      await writeFileToWorkingTree(cwd, path, content);
      return { ok: true };
    },
  );

  ipcMain.handle(
    CHANNELS.ReposBranches,
    async (_event, rawPayload: unknown): Promise<RepoBranches> => {
      const { repoId } = RepoBranchesPayloadSchema.parse(rawPayload);
      const { cwd } = await loadRepoContext(repoId);
      const [local, remote, head] = await Promise.all([
        listLocalBranches(cwd),
        listRemoteBranches(cwd),
        currentBranch(cwd),
      ]);
      return { local, remote, currentBranch: head };
    },
  );

  ipcMain.handle(
    CHANNELS.ReposRecentCommits,
    async (_event, rawPayload: unknown): Promise<RecentCommit[]> => {
      const { repoId } = RecentCommitsPayloadSchema.parse(rawPayload);
      const { cwd } = await loadRepoContext(repoId);
      return listRecentCommits(cwd);
    },
  );
}

import { ipcMain } from "electron";
import { CHANNELS } from "@shared/channels";
import {
  CreateDiffFromPrPayloadSchema,
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
  type Worktree,
  WorktreesPayloadSchema,
  WriteFilePayloadSchema,
} from "@shared/schemas";
import { findRepoOrThrow } from "../config/repos";
import { viewPullRequest } from "../githubCli";
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
  listWorktrees,
  readFileAtRef,
  resolveAndDiff,
  rightSideHashForPath,
  rightSideIsLive,
  run,
  tryResolveOrNull,
  writeFileToWorkingTree,
} from "../git";

async function loadDiffContext(repoId: string, diffId: string) {
  const repo = await findRepoOrThrow(repoId);
  const diff = await findDiffOrThrow(repoId, diffId);
  // All right-side git ops (workingTree reads/writes, HEAD resolution,
  // "is live" checks) route through the bound worktree when present so
  // a diff against a non-main worktree sees that worktree's state.
  const cwd = diff.rightWorktreePath ?? repo.path;
  return { repo, diff, cwd };
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

  ipcMain.handle(
    CHANNELS.ReposWorktrees,
    async (_event, rawPayload: unknown): Promise<Worktree[]> => {
      const { repoId } = WorktreesPayloadSchema.parse(rawPayload);
      const { cwd } = await loadRepoContext(repoId);
      return listWorktrees(cwd);
    },
  );

  ipcMain.handle(
    CHANNELS.DiffsCreateFromPullRequest,
    async (_event, rawPayload: unknown): Promise<Diff> => {
      const { repoId, number } = CreateDiffFromPrPayloadSchema.parse(rawPayload);
      const { cwd } = await loadRepoContext(repoId);
      // Pull metadata first so we fail fast if the PR is missing or gh
      // is misconfigured.
      const pr = await viewPullRequest(cwd, number);

      // Fetch the PR head into a private ref using GitHub's pull/<n>/head
      // refspec. This works for fork PRs too (GitHub mirrors PR heads
      // into the base repo's refs/pull namespace). No checkout, no
      // working-tree mutation; the user's current state is untouched.
      const localRef = `refs/preview/pull/${number}`;
      await run(cwd, ["fetch", "origin", `pull/${number}/head:${localRef}`]);

      // Best-effort fetch of the base branch in case it has moved since
      // the user last fetched. If this fails (offline, missing base on
      // origin), the resolve will surface a useful error later.
      try {
        await run(cwd, ["fetch", "origin", pr.baseRefName]);
      } catch {
        // intentional: keep going so the diff still resolves against the
        // stale local origin/<base> if that's all we have.
      }

      // The diff is mergeBase(<pr head>, origin/<base>) ↔ <pr head>.
      // origin/<base> resolves via the standard remote-tracking ref;
      // refs/preview/pull/<n> resolves to the PR head we just fetched.
      return createDiff({
        repoId,
        name: `PR #${pr.number}: ${pr.title}`,
        left: {
          kind: "mergeBase",
          a: { kind: "branch", name: localRef },
          b: { kind: "branch", name: `origin/${pr.baseRefName}` },
        },
        right: { kind: "branch", name: localRef },
      });
    },
  );
}

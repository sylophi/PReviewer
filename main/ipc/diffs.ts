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
import { type PullRequestView, viewPullRequest } from "../githubCli";
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
      const { repoId, number, rightWorktreePath } =
        CreateDiffFromPrPayloadSchema.parse(rawPayload);
      const { cwd } = await loadRepoContext(repoId);
      // gh's canonical SHAs for the PR. These match what `gh pr diff` uses.
      const pr = await viewPullRequest(cwd, number);

      // Fetch the PR head into a private ref via GitHub's pull/<n>/head
      // refspec (works for fork PRs too; GitHub mirrors PR heads into
      // the base repo). The ref keeps the head SHA reachable across
      // future git GCs; the working tree stays untouched.
      const localRef = `refs/preview/pull/${number}`;
      await run(cwd, ["fetch", "origin", `pull/${number}/head:${localRef}`]);

      // We need the base ref locally so we can compute the three-dot
      // merge-base — same one `gh pr diff` uses.
      await run(cwd, ["fetch", "origin", pr.baseRefName]);

      // Right side is always the PR's head SHA. The left side has two
      // failure modes worth defending against:
      //   1. Open PR: merge-base(head, base) is the correct three-dot
      //      anchor and matches `gh pr diff` exactly.
      //   2. Merged PR: head is reachable from base, so the naive
      //      merge-base equals head and the diff goes empty. The merge
      //      commit's first parent IS the base tip at merge time, so we
      //      pull that and diff against it.
      const leftSha = await computePrLeftSha(cwd, pr);

      return createDiff({
        repoId,
        name: `PR #${pr.number}: ${pr.title}`,
        left: { kind: "commit", hash: leftSha },
        right: { kind: "commit", hash: pr.headRefOid },
        ...(rightWorktreePath ? { rightWorktreePath } : {}),
      });
    },
  );
}

async function computePrLeftSha(cwd: string, pr: PullRequestView): Promise<string> {
  // Merged PR with a known merge commit: its first parent is the base
  // branch's tip at the instant of the merge, which is the canonical
  // left side for "what did this PR change".
  if (pr.state === "MERGED" && pr.mergeCommit?.oid) {
    try {
      // Make sure the merge commit is actually present in the local
      // object DB; on a clone that never pulled main, it may not be.
      await run(cwd, ["fetch", "origin", pr.mergeCommit.oid]).catch(() => {
        /* the SHA might already be reachable; ignore */
      });
      const parent = (
        await run(cwd, ["rev-parse", `${pr.mergeCommit.oid}^1`])
      ).trim();
      if (parent) return parent;
    } catch {
      // Fall through to the merge-base attempt below.
    }
  }
  const baseSha = (await run(cwd, ["rev-parse", `origin/${pr.baseRefName}`])).trim();
  try {
    const mb = (await run(cwd, ["merge-base", pr.headRefOid, baseSha])).trim();
    // Skip the degenerate case where head is reachable from base (the
    // user is looking at a merged PR but mergeCommit wasn't available);
    // falling back to the current base tip is the least-broken choice.
    if (mb && mb !== pr.headRefOid) return mb;
  } catch {
    // No common ancestor; baseSha is the best we can do.
  }
  return baseSha;
}

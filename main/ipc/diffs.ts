import type { Diff, Repo } from "@shared/schemas";
import { diffsContract } from "@shared/ipc/modules/diffs";
import type { Handlers } from "@shared/ipc/types";
import { worktreeForPullRequest } from "@shared/refExpr";
import { findRepoOrThrow } from "../config/repos";
import { type PullRequestView, viewPullRequest } from "../githubCli";
import {
  clearWorktreeBinding,
  createDiff,
  deleteDiff,
  findDiffOrThrow,
  listDiffs,
  setPin,
  setReviewed,
  updateDiffRefs,
} from "../config/diffs";
import {
  enrichWithReviewed,
  freezeRef,
  fullFileTree,
  isGitRepo,
  listWorktrees,
  readBlob,
  readFileAtRef,
  resolveAndDiff,
  rightSideHashForPath,
  rightSideIsLive,
  run,
  runLenient,
  tryResolveOrNull,
  writeFileToWorkingTree,
} from "../git";

async function loadDiffContext(repoId: string, diffId: string) {
  const repo = await findRepoOrThrow(repoId);
  let diff = await findDiffOrThrow(repoId, diffId);
  // A diff can be bound to a worktree (rightWorktreePath) so its right-side
  // git ops see that checkout's state. If the user has since deleted that
  // worktree, the path is no longer a git dir and every command here would
  // fail with "not a git repository". Self-heal rather than fail every op.
  if (diff.rightWorktreePath && !(await isGitRepo(diff.rightWorktreePath))) {
    diff = await healDeadWorktreeBinding(repo, diff);
  }
  const cwd = diff.rightWorktreePath ?? repo.path;
  return { repo, diff, cwd };
}

// For a plain refs diff, dropping the dead binding is enough: the refs
// still resolve against the main repo. A PR diff whose right side was
// the live checkout must NOT fall back to reading the main worktree —
// that would silently diff the wrong code. Freeze it to the PR's
// keep-alive ref instead (fetched at creation, still in the object DB).
async function healDeadWorktreeBinding(repo: Repo, diff: Diff): Promise<Diff> {
  if (diff.prNumber && diff.right.kind === "workingTree") {
    const sha = (
      await runLenient(repo.path, [
        "rev-parse",
        "--verify",
        "-q",
        `refs/previewer/pull/${diff.prNumber}`,
      ])
    ).trim();
    if (sha.length > 0) {
      return updateDiffRefs(diff.repoId, diff.id, {
        left: diff.left,
        right: { kind: "commit", hash: sha },
        rightWorktreePath: null,
      });
    }
  }
  return clearWorktreeBinding(diff.repoId, diff.id);
}

export const diffsHandlers: Handlers<typeof diffsContract> = {
  list: ({ repoId }) => listDiffs(repoId),

  create: async (input) => {
    await findRepoOrThrow(input.repoId);
    return createDiff(input);
  },

  get: ({ repoId, diffId }) => findDiffOrThrow(repoId, diffId),

  delete: async ({ repoId, diffId }) => {
    // Best-effort cleanup of the private PR keep-alive ref, unless
    // another diff for the same PR still needs it. Failures here never
    // block the delete.
    try {
      const diff = await findDiffOrThrow(repoId, diffId);
      if (diff.prNumber) {
        const repo = await findRepoOrThrow(repoId);
        const siblings = await listDiffs(repoId);
        const stillUsed = siblings.some((d) => d.id !== diffId && d.prNumber === diff.prNumber);
        if (!stillUsed) {
          await run(repo.path, ["update-ref", "-d", `refs/previewer/pull/${diff.prNumber}`]).catch(
            () => undefined,
          );
        }
      }
    } catch {
      // The diff record may already be gone; deletion below is idempotent.
    }
    await deleteDiff(repoId, diffId);
  },

  resolve: async ({ repoId, diffId }) => {
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

  fullTree: async ({ repoId, diffId }) => {
    const { diff, cwd } = await loadDiffContext(repoId, diffId);
    return fullFileTree(cwd, diff.right);
  },

  setReviewed: async ({ repoId, diffId, path, reviewed }) => {
    const { diff, cwd } = await loadDiffContext(repoId, diffId);
    const right = freezeRef(diff.right, diff.pinned?.rightHash);
    const hash = await rightSideHashForPath(cwd, right, path);
    return setReviewed(repoId, diffId, path, reviewed, hash);
  },

  setPin: async ({ repoId, diffId, pinned }) => {
    const { diff, cwd } = await loadDiffContext(repoId, diffId);
    if (!pinned) return setPin(repoId, diffId, null);
    const [leftHash, rightHash] = await Promise.all([
      tryResolveOrNull(cwd, diff.left),
      tryResolveOrNull(cwd, diff.right),
    ]);
    return setPin(repoId, diffId, { leftHash, rightHash });
  },

  readFile: async ({ repoId, diffId, path, side }) => {
    const { diff, cwd } = await loadDiffContext(repoId, diffId);
    const ref = side === "left" ? diff.left : diff.right;
    const frozenHash = side === "left" ? diff.pinned?.leftHash : diff.pinned?.rightHash;
    const frozen = freezeRef(ref, frozenHash);
    const content = await readFileAtRef(cwd, frozen, path);
    const editable =
      side === "right" && diff.pinned === null && (await rightSideIsLive(cwd, diff.right));
    return { content, editable };
  },

  readReviewedSnapshot: async ({ repoId, diffId, path }) => {
    const { diff, cwd } = await loadDiffContext(repoId, diffId);
    const stored = diff.reviewed[path];
    if (!stored || stored.hash.length === 0) return { content: null };
    return { content: await readBlob(cwd, stored.hash) };
  },

  writeFile: async ({ repoId, diffId, path, content }) => {
    const { diff, cwd } = await loadDiffContext(repoId, diffId);
    if (diff.pinned !== null || !(await rightSideIsLive(cwd, diff.right))) {
      throw new Error(
        "This diff isn't editable: its right side isn't the currently checked-out branch, or the diff is pinned.",
      );
    }
    await writeFileToWorkingTree(cwd, path, content);
    return { ok: true as const };
  },

  createFromPullRequest: async ({ repoId, number }) => {
    const repo = await findRepoOrThrow(repoId);
    const cwd = repo.path;
    // gh's canonical SHAs for the PR. These match what `gh pr diff` uses.
    const pr = await viewPullRequest(cwd, number);

    // Fetch the PR head into a private ref via GitHub's pull/<n>/head
    // refspec (works for fork PRs too; GitHub mirrors PR heads into
    // the base repo). The ref keeps the head SHA reachable across
    // future git GCs; the working tree stays untouched.
    const localRef = `refs/previewer/pull/${number}`;
    await run(cwd, ["fetch", "origin", `pull/${number}/head:${localRef}`]);

    // We need the base ref locally so we can compute the three-dot
    // merge-base — same one `gh pr diff` uses.
    await run(cwd, ["fetch", "origin", pr.baseRefName]);

    // Left side has two failure modes worth defending against:
    //   1. Open PR: merge-base(head, base) is the correct three-dot anchor.
    //   2. Merged PR: head is reachable from base, so the naive merge-base
    //      equals head and the diff goes empty. The merge commit's first
    //      parent IS the base tip at merge time; pull that and diff.
    const leftSha = await computePrLeftSha(cwd, pr);
    const left = { kind: "commit", hash: leftSha } as const;

    // Right side: if some worktree already has the PR's branch checked
    // out, review the live checkout — editable, and needs-re-review
    // tracks the actual files on disk. Otherwise freeze to the head SHA.
    const checkout = worktreeForPullRequest(await listWorktrees(cwd), pr);
    const right = checkout
      ? ({ kind: "workingTree" } as const)
      : ({ kind: "commit", hash: pr.headRefOid } as const);
    // Binding to the main worktree is a no-op (cwd already defaults to
    // it); only record non-main checkouts.
    const rightWorktreePath = checkout && !checkout.isMain ? checkout.path : null;
    const name = `PR #${pr.number}: ${pr.title}`;

    // Re-picking a PR that already has a diff opens the existing review
    // (refreshed to the PR's current state) instead of creating a
    // duplicate. Reviewed marks survive; needs-re-review flags whatever
    // moved. Pinned diffs are left exactly as the user froze them.
    // Diffs created before `prNumber` existed are matched by their
    // generated "PR #<n>: " name so legacy reviews aren't duplicated.
    const namePrefix = `PR #${number}: `;
    const existing = (await listDiffs(repoId)).find(
      (d) => d.prNumber === number || (d.prNumber === undefined && d.name.startsWith(namePrefix)),
    );
    if (existing) {
      if (existing.pinned !== null) return existing;
      return updateDiffRefs(repoId, existing.id, {
        left,
        right,
        rightWorktreePath,
        name,
        prNumber: pr.number,
      });
    }

    return createDiff({
      repoId,
      name,
      left,
      right,
      prNumber: pr.number,
      ...(rightWorktreePath ? { rightWorktreePath } : {}),
    });
  },
};

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
      const parent = (await run(cwd, ["rev-parse", `${pr.mergeCommit.oid}^1`])).trim();
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

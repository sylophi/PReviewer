// Per-diff state under PReviewer's app-data directory.
// One file per diff; listing = readdir + read each.
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { type Diff, DiffSchema, type RefExpr } from "@shared/schemas";
import { diffTitle } from "@shared/refExpr";
import { atomicWriteJson, readJsonOrNull } from "../util/jsonFile";
import { previewerRoot } from "../util/paths";
import { randomShortId } from "../util/id";

function diffsDir(repoId: string): string {
  return join(previewerRoot(), "repos", repoId, "diffs");
}

// Serialize read-modify-write cycles per diff file. atomicWriteJson
// only prevents torn files; without this, two concurrent mutations
// (e.g. rapid mark-reviewed clicks on different paths) would both read
// the same base state and the second write would drop the first mark.
const diffLocks = new Map<string, Promise<unknown>>();

async function withDiffLock<T>(repoId: string, diffId: string, fn: () => Promise<T>): Promise<T> {
  const key = `${repoId}/${diffId}`;
  const prev = diffLocks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const settled = next.catch(() => undefined);
  diffLocks.set(key, settled);
  try {
    return await next;
  } finally {
    if (diffLocks.get(key) === settled) diffLocks.delete(key);
  }
}

function diffJsonPath(repoId: string, diffId: string): string {
  return join(diffsDir(repoId), `${diffId}.json`);
}

export async function listDiffs(repoId: string): Promise<Diff[]> {
  let entries;
  try {
    entries = await readdir(diffsDir(repoId), { withFileTypes: true });
  } catch {
    return [];
  }
  const diffs = await Promise.all(
    entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => {
        const id = e.name.slice(0, -".json".length);
        return readJsonOrNull(diffJsonPath(repoId, id), DiffSchema);
      }),
  );
  return diffs.filter((d): d is Diff => d !== null).toSorted((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDiff(repoId: string, diffId: string): Promise<Diff | null> {
  return readJsonOrNull(diffJsonPath(repoId, diffId), DiffSchema);
}

export async function findDiffOrThrow(repoId: string, diffId: string): Promise<Diff> {
  const diff = await getDiff(repoId, diffId);
  if (!diff) throw new Error(`Unknown diff: ${diffId}`);
  return diff;
}

interface CreateDiffInput {
  repoId: string;
  name?: string | undefined;
  left: RefExpr;
  right: RefExpr;
  rightWorktreePath?: string | undefined;
  prNumber?: number | undefined;
}

export async function createDiff(input: CreateDiffInput): Promise<Diff> {
  const id = randomShortId();
  const now = Date.now();
  const trimmedName = input.name?.trim();
  const diff: Diff = {
    id,
    repoId: input.repoId,
    name: trimmedName || diffTitle(input.left, input.right),
    left: input.left,
    right: input.right,
    ...(input.rightWorktreePath ? { rightWorktreePath: input.rightWorktreePath } : {}),
    ...(input.prNumber ? { prNumber: input.prNumber } : {}),
    pinned: null,
    reviewed: {},
    createdAt: now,
    updatedAt: now,
  };
  await atomicWriteJson(diffJsonPath(input.repoId, id), DiffSchema.parse(diff));
  return diff;
}

export async function deleteDiff(repoId: string, diffId: string): Promise<void> {
  await rm(diffJsonPath(repoId, diffId), { force: true });
}

export async function setReviewed(
  repoId: string,
  diffId: string,
  path: string,
  reviewed: boolean,
  // Caller passes the current right-side hash so we can persist it
  // alongside the mark. null means "we couldn't hash it" (e.g. deleted
  // file); we still set the mark, but needsReReview stays false.
  currentHash: string | null,
): Promise<Diff> {
  return withDiffLock(repoId, diffId, async () => {
    const diff = await findDiffOrThrow(repoId, diffId);
    const nextReviewed = { ...diff.reviewed };
    if (reviewed) {
      nextReviewed[path] = {
        hash: currentHash ?? "",
        markedAt: Date.now(),
      };
    } else {
      delete nextReviewed[path];
    }
    const next: Diff = {
      ...diff,
      reviewed: nextReviewed,
      updatedAt: Date.now(),
    };
    await atomicWriteJson(diffJsonPath(repoId, diffId), DiffSchema.parse(next));
    return next;
  });
}

export async function setPin(
  repoId: string,
  diffId: string,
  pinned: { leftHash: string | null; rightHash: string | null } | null,
): Promise<Diff> {
  return withDiffLock(repoId, diffId, async () => {
    const diff = await findDiffOrThrow(repoId, diffId);
    const next: Diff = {
      ...diff,
      pinned,
      updatedAt: Date.now(),
    };
    await atomicWriteJson(diffJsonPath(repoId, diffId), DiffSchema.parse(next));
    return next;
  });
}

// Drop the rightWorktreePath binding. Called when the bound worktree
// has been deleted on disk: the diff's refs are still valid against the
// main repo, so we strip the dead binding rather than fail every git
// op (or delete the diff). No-op if there was no binding.
export async function clearWorktreeBinding(repoId: string, diffId: string): Promise<Diff> {
  return withDiffLock(repoId, diffId, async () => {
    const diff = await findDiffOrThrow(repoId, diffId);
    if (!diff.rightWorktreePath) return diff;
    const next: Diff = { ...diff, updatedAt: Date.now() };
    delete (next as { rightWorktreePath?: string }).rightWorktreePath;
    await atomicWriteJson(diffJsonPath(repoId, diffId), DiffSchema.parse(next));
    return next;
  });
}

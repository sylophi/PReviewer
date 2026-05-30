// Per-diff state at ~/preview[-dev]/repos/<repoId>/diffs/<diffId>.json.
// One file per diff; listing = readdir + read each.
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { type Diff, DiffSchema, type RefExpr } from "@shared/schemas";
import { diffTitle } from "@shared/refExpr";
import { atomicWriteJson, readJsonOrNull } from "../util/jsonFile";
import { previewRoot } from "../util/paths";
import { randomShortId } from "../util/id";

function diffsDir(repoId: string): string {
  return join(previewRoot(), "repos", repoId, "diffs");
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
}

export async function setPin(
  repoId: string,
  diffId: string,
  pinned: { leftHash: string | null; rightHash: string | null } | null,
): Promise<Diff> {
  const diff = await findDiffOrThrow(repoId, diffId);
  const next: Diff = {
    ...diff,
    pinned,
    updatedAt: Date.now(),
  };
  await atomicWriteJson(diffJsonPath(repoId, diffId), DiffSchema.parse(next));
  return next;
}

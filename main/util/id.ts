import { createHash, randomBytes } from "node:crypto";

// Deterministic short id for the absolute path of a registered repo.
// Same path always returns the same id, which makes "add" idempotent
// without a per-call de-dupe round trip.
export function repoIdFromPath(absolutePath: string): string {
  return createHash("sha256").update(absolutePath).digest("hex").slice(0, 12);
}

// Random short id for non-deterministic records (e.g. diffs).
export function randomShortId(): string {
  return randomBytes(6).toString("hex");
}

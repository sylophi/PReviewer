// Unified patch generation and per-file change list for arbitrary ref
// pairs. The tabbed Monaco view reads file contents separately, but the
// patch is still useful for export and as a fast file-list source.
import type { FileChange, RefExpr } from "@shared/schemas";
import { runLenient } from "./core";
import { resolveForDiff } from "./refs";

export interface ResolvedSides {
  leftCommit: string | null;
  rightCommit: string | null;
  patch: string;
  files: FileChange[];
}

export async function resolveAndDiff(
  cwd: string,
  left: RefExpr,
  right: RefExpr,
): Promise<ResolvedSides> {
  const [leftCommit, rightCommit] = await Promise.all([
    resolveForDiff(cwd, left),
    resolveForDiff(cwd, right),
  ]);

  const leftIsWT = left.kind === "workingTree";
  const rightIsWT = right.kind === "workingTree";
  const flags = { leftIsWT, rightIsWT };

  const [patch, files] = await Promise.all([
    computePatch(cwd, leftCommit, rightCommit, flags),
    computeFileList(cwd, leftCommit, rightCommit, flags),
  ]);

  return { leftCommit, rightCommit, patch, files };
}

interface SideFlags {
  leftIsWT: boolean;
  rightIsWT: boolean;
}

async function computePatch(
  cwd: string,
  leftCommit: string | null,
  rightCommit: string | null,
  flags: SideFlags,
): Promise<string> {
  if (flags.leftIsWT && flags.rightIsWT) return "";
  if (flags.rightIsWT) return diffAgainstWorkingTree(cwd, leftCommit!);
  if (flags.leftIsWT) {
    // Symmetric case is uncommon; -R reads as "if I applied my edits
    // this is what would change."
    return runLenient(cwd, ["diff", "-R", rightCommit!]);
  }
  return runLenient(cwd, ["diff", leftCommit!, rightCommit!]);
}

async function diffAgainstWorkingTree(cwd: string, leftCommit: string): Promise<string> {
  // Tracked changes between commit and index+working tree, plus the
  // untracked files (which need their own no-index diff vs /dev/null to
  // show up in the unified patch).
  const [tracked, untrackedRaw] = await Promise.all([
    runLenient(cwd, ["diff", leftCommit]),
    runLenient(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const untracked = untrackedRaw.split("\0").filter(Boolean);
  if (untracked.length === 0) return tracked;
  // One `git diff --no-index` process per untracked file, but bounded:
  // an un-ignored node_modules would otherwise spawn thousands of
  // concurrent git processes.
  const untrackedPatches = await mapWithConcurrency(untracked, 8, (f) =>
    runLenient(cwd, ["diff", "--no-index", "/dev/null", f]),
  );
  return tracked + untrackedPatches.join("");
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function computeFileList(
  cwd: string,
  leftCommit: string | null,
  rightCommit: string | null,
  flags: SideFlags,
): Promise<FileChange[]> {
  if (flags.leftIsWT && flags.rightIsWT) return [];
  if (flags.rightIsWT) return fileListAgainstWorkingTree(cwd, leftCommit!);
  if (flags.leftIsWT) {
    const rev = await fileListAgainstWorkingTree(cwd, rightCommit!);
    return rev.map(invertChange);
  }
  return fileListFromRefs(cwd, leftCommit!, rightCommit!);
}

async function fileListAgainstWorkingTree(cwd: string, leftCommit: string): Promise<FileChange[]> {
  const [statusRaw, numstatRaw, untrackedRaw] = await Promise.all([
    runLenient(cwd, ["diff", "--name-status", "-z", leftCommit]),
    runLenient(cwd, ["diff", "--numstat", "-z", leftCommit]),
    runLenient(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const tracked = mergeStatusAndNumstat(statusRaw, numstatRaw);
  const untracked: FileChange[] = untrackedRaw
    .split("\0")
    .filter(Boolean)
    .map((p) => ({
      path: p,
      fromPath: p,
      kind: "untracked",
      additions: 0,
      deletions: 0,
      reviewed: false,
      needsReReview: false,
    }));
  return [...tracked, ...untracked];
}

function invertChange(change: FileChange): FileChange {
  let kind: FileChange["kind"];
  switch (change.kind) {
    case "added":
      kind = "deleted";
      break;
    case "deleted":
      kind = "added";
      break;
    default:
      kind = change.kind;
  }
  return {
    ...change,
    kind,
    additions: change.deletions,
    deletions: change.additions,
  };
}

export async function fileListFromRefs(
  cwd: string,
  leftCommit: string,
  rightCommit: string,
): Promise<FileChange[]> {
  const [statusRaw, numstatRaw] = await Promise.all([
    runLenient(cwd, ["diff", "--name-status", "-z", leftCommit, rightCommit]),
    runLenient(cwd, ["diff", "--numstat", "-z", leftCommit, rightCommit]),
  ]);
  return mergeStatusAndNumstat(statusRaw, numstatRaw);
}

function mergeStatusAndNumstat(statusRaw: string, numstatRaw: string): FileChange[] {
  const numByPath = parseNumstat(numstatRaw);
  return parseNameStatus(statusRaw).map((c) => {
    const num = numByPath.get(c.path);
    if (!num) return c;
    // numstat reports "-\t-" for binary content; surface that as its
    // own kind so the renderer can skip the text diff editor.
    const kind = num.binary && c.kind !== "deleted" ? ("binary" as const) : c.kind;
    return { ...c, kind, additions: num.additions, deletions: num.deletions };
  });
}

// git diff --name-status -z records: status and path are NUL-separated
// (not tab-separated as in the non-z form), so each entry takes two
// slots: "<S>\0<path>\0". Renames/copies take three: "R<score>\0<from>\0<to>\0".
function parseNameStatus(raw: string): FileChange[] {
  const parts = raw.split("\0");
  const out: FileChange[] = [];
  let i = 0;
  while (i < parts.length) {
    const code = parts[i];
    if (!code) {
      i++;
      continue;
    }
    if (code.startsWith("R") || code.startsWith("C")) {
      const from = parts[i + 1];
      const to = parts[i + 2];
      if (from && to) {
        out.push({
          path: to,
          fromPath: from,
          kind: "renamed",
          additions: 0,
          deletions: 0,
          reviewed: false,
          needsReReview: false,
        });
      }
      i += 3;
    } else {
      const path = parts[i + 1];
      if (path) {
        out.push({
          path,
          fromPath: path,
          kind: statusCodeToKind(code),
          additions: 0,
          deletions: 0,
          reviewed: false,
          needsReReview: false,
        });
      }
      i += 2;
    }
  }
  return out;
}

function statusCodeToKind(code: string): FileChange["kind"] {
  if (code.startsWith("A")) return "added";
  if (code.startsWith("D")) return "deleted";
  if (code.startsWith("R") || code.startsWith("C")) return "renamed";
  return "modified";
}

interface NumstatEntry {
  additions: number;
  deletions: number;
  binary: boolean;
}

// --numstat -z: "<adds>\t<dels>\t<path>\0" for normal entries, but
// renames split the path across the NUL boundary too:
// "<adds>\t<dels>\t\0<from>\0<to>\0". Binary files emit
// "-\t-\t<path>\0"; recorded as 0/0 with the binary flag set.
function parseNumstat(raw: string): Map<string, NumstatEntry> {
  const out = new Map<string, NumstatEntry>();
  const parts = raw.split("\0");
  let i = 0;
  while (i < parts.length) {
    const record = parts[i];
    if (!record) {
      i++;
      continue;
    }
    const [adds, dels, ...rest] = record.split("\t");
    let path = rest.join("\t");
    if (path === "") {
      // Rename record: the two trailing fields after the empty path
      // slot are the from / to paths, NUL-separated.
      const to = parts[i + 2];
      if (to) path = to;
      i += 3;
    } else {
      i++;
    }
    if (!path) continue;
    const binary = adds === "-" && dels === "-";
    const a = adds === "-" ? 0 : Number(adds);
    const d = dels === "-" ? 0 : Number(dels);
    out.set(path, {
      additions: Number.isFinite(a) ? a : 0,
      deletions: Number.isFinite(d) ? d : 0,
      binary,
    });
  }
  return out;
}

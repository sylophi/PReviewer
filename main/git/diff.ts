// Unified patch generation and per-file change list for arbitrary ref
// pairs. The tabbed Monaco view reads file contents separately, but the
// patch is still useful for export and as a fast file-list source.
import type { FileChange, RefExpr } from "@shared/schemas";
import { runLenient } from "./core";
import { tryResolveOrNull } from "./refs";

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
    tryResolveOrNull(cwd, left),
    tryResolveOrNull(cwd, right),
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
  const untrackedPatches = await Promise.all(
    untracked.map((f) => runLenient(cwd, ["diff", "--no-index", "/dev/null", f])),
  );
  return tracked + untrackedPatches.join("");
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
    return num ? { ...c, additions: num[0], deletions: num[1] } : c;
  });
}

// git diff --name-status -z records: "<S>\t<path>\0", or for renames
// "R<score>\t<from>\0<to>\0".
function parseNameStatus(raw: string): FileChange[] {
  const parts = raw.split("\0");
  const out: FileChange[] = [];
  let i = 0;
  while (i < parts.length) {
    const head = parts[i];
    if (!head) {
      i++;
      continue;
    }
    const tabIdx = head.indexOf("\t");
    if (tabIdx < 0) {
      i++;
      continue;
    }
    const statusCode = head.slice(0, tabIdx);
    const first = head.slice(tabIdx + 1);
    const kind = statusCodeToKind(statusCode);
    if (statusCode.startsWith("R") || statusCode.startsWith("C")) {
      const to = parts[i + 1] ?? first;
      out.push({
        path: to,
        fromPath: first,
        kind: "renamed",
        additions: 0,
        deletions: 0,
        reviewed: false,
        needsReReview: false,
      });
      i += 2;
    } else {
      out.push({
        path: first,
        fromPath: first,
        kind,
        additions: 0,
        deletions: 0,
        reviewed: false,
        needsReReview: false,
      });
      i++;
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

// --numstat -z: "<adds>\t<dels>\t<path>\0". Binary files emit
// "-\t-\t<path>\0"; recorded as 0/0 here.
function parseNumstat(raw: string): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const record of raw.split("\0")) {
    if (!record) continue;
    const [adds, dels, ...rest] = record.split("\t");
    const path = rest.join("\t");
    if (!path) continue;
    const a = adds === "-" ? 0 : Number(adds);
    const d = dels === "-" ? 0 : Number(dels);
    out.set(path, [Number.isFinite(a) ? a : 0, Number.isFinite(d) ? d : 0]);
  }
  return out;
}

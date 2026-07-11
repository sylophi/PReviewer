// Read/write a single file at a given side of a diff. Reads handle
// any committish via git show; writes are gated to the working tree
// of the currently-checked-out branch so a diff against a frozen commit
// can't accidentally smear edits into history.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RefExpr } from "@shared/schemas";
import { run } from "./core";
import { currentBranch, tryResolveOrNull } from "./refs";
import { isENOENT } from "../util/paths";

export async function readFileAtRef(
  cwd: string,
  ref: RefExpr,
  path: string,
): Promise<string | null> {
  if (ref.kind === "workingTree") {
    return readFromDisk(cwd, path);
  }
  // Unresolvable refs (e.g. HEAD in a repo with no commits yet) read as
  // "no content on this side" rather than failing the whole tab.
  let commit: string | null;
  try {
    commit = await tryResolveOrNull(cwd, ref);
  } catch {
    commit = null;
  }
  if (!commit) return null;
  try {
    return await run(cwd, ["show", `${commit}:${path}`]);
  } catch {
    return null;
  }
}

async function readFromDisk(cwd: string, path: string): Promise<string | null> {
  try {
    return await readFile(join(cwd, path), "utf8");
  } catch (err) {
    if (isENOENT(err)) return null;
    throw err;
  }
}

// True when writing to the working tree would land on the right side
// of the diff: either right *is* the live working tree, or right is
// the tip of the currently-checked-out branch.
export async function rightSideIsLive(cwd: string, right: RefExpr): Promise<boolean> {
  if (right.kind === "workingTree") return true;
  if (right.kind === "head") return true;
  if (right.kind === "branch") {
    return (await currentBranch(cwd)) === right.name;
  }
  // commit / mergeBase / pr: even if the resolved hash happens to equal
  // HEAD, refuse — the relationship is pinned and explicit. Unpin to edit.
  return false;
}

export async function writeFileToWorkingTree(
  cwd: string,
  path: string,
  content: string,
): Promise<void> {
  await writeFile(join(cwd, path), content, "utf8");
}

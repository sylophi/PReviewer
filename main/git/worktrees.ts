// Enumerate the worktrees attached to a repo. shigomori (or any other
// tool) is responsible for creating, pruning, and managing them; PReview
// only reads the list. `git worktree list --porcelain` works from any
// worktree of the repo since they share the same `.git`.
import { run } from "./core";

export interface Worktree {
  // Absolute path on disk.
  path: string;
  // Current HEAD commit.
  head: string;
  // Branch name without the refs/heads/ prefix, or null when detached.
  branch: string | null;
  detached: boolean;
  // The repo's main worktree (first entry returned by git).
  isMain: boolean;
  locked: boolean;
}

export async function listWorktrees(cwd: string): Promise<Worktree[]> {
  const raw = await run(cwd, ["worktree", "list", "--porcelain"]);
  return parsePorcelain(raw);
}

// `git worktree list --porcelain` emits blank-line-separated blocks; each
// block has `worktree <path>`, `HEAD <sha>`, and either `branch refs/...`,
// `detached`, or `bare`. `locked [<reason>]` is optional.
function parsePorcelain(raw: string): Worktree[] {
  const blocks = raw.split(/\r?\n\r?\n/).filter((b) => b.trim().length > 0);
  return blocks.map((block, i) => parseBlock(block, i === 0));
}

function parseBlock(block: string, isMain: boolean): Worktree {
  let path = "";
  let head = "";
  let branch: string | null = null;
  let detached = false;
  let locked = false;

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      path = line.slice("worktree ".length).trim();
    } else if (line.startsWith("HEAD ")) {
      head = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length).trim();
      branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
    } else if (line === "detached") {
      detached = true;
    } else if (line === "locked" || line.startsWith("locked ")) {
      locked = true;
    }
  }

  return { path, head, branch, detached, isMain, locked };
}

import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fsContract } from "@shared/ipc/modules/fs";
import type { Handlers } from "@shared/ipc/types";
import { isGitRepo } from "../git/core";
import { toAbsolute } from "../util/paths";

// Directories that virtually never contain git repos but are huge and
// slow to walk. Skipped during the scan to keep it responsive.
const SCAN_SKIP_DIRS = new Set([
  "node_modules",
  "target",
  "dist",
  "build",
  "vendor",
  "venv",
  ".venv",
  "__pycache__",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
]);

const SCAN_MAX_DEPTH = 6;

async function scanForGitRepos(rootPath: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > SCAN_MAX_DEPTH) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // `.git` is a directory in a standard checkout but a plain file in
    // linked worktrees and submodules; both are usable repos.
    if (entries.some((e) => e.name === ".git" && (e.isDirectory() || e.isFile()))) {
      results.push(dir);
      return;
    }

    const subdirs = entries.filter(
      (e) =>
        e.isDirectory() &&
        !e.isSymbolicLink() &&
        !e.name.startsWith(".") &&
        !SCAN_SKIP_DIRS.has(e.name),
    );

    await Promise.all(subdirs.map((entry) => walk(join(dir, entry.name), depth + 1)));
  }

  await walk(rootPath, 0);
  return results.toSorted();
}

export const fsHandlers: Handlers<typeof fsContract> = {
  listDirectory: async ({ path }) => {
    const absolute = toAbsolute(path);
    const entries = await readdir(absolute, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));
    const isGitRepoFlags = await Promise.all(
      dirs.map(async (e) => {
        try {
          await access(join(absolute, e.name, ".git"));
          return true;
        } catch {
          return false;
        }
      }),
    );
    const result = dirs
      .map((e, i) => ({ name: e.name, isGitRepo: isGitRepoFlags[i] }))
      .toSorted((a, b) => a.name.localeCompare(b.name));
    return { path: absolute, entries: result };
  },
  isGitRepo: async ({ path }) => isGitRepo(toAbsolute(path)),
  scanForGitRepos: async ({ path }) => scanForGitRepos(toAbsolute(path)),
};

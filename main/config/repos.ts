// Per-repo metadata at ~/preview[-dev]/repos/<repoId>/repo.json. Listing
// repos = readdir the parent + read each repo.json in parallel.
import { readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { type Repo, RepoSchema } from "@shared/schemas";
import { getOriginUrl, isGitRepo } from "../git";
import { atomicWriteJson, readJsonOrNull } from "../util/jsonFile";
import { previewRoot } from "../util/paths";
import { repoIdFromPath } from "../util/id";

function reposDir(): string {
  return join(previewRoot(), "repos");
}

function repoDir(id: string): string {
  return join(reposDir(), id);
}

function repoJsonPath(id: string): string {
  return join(repoDir(id), "repo.json");
}

export async function listRepos(): Promise<Repo[]> {
  let entries;
  try {
    entries = await readdir(reposDir(), { withFileTypes: true });
  } catch {
    return [];
  }
  const repos = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map((e) => readJsonOrNull(repoJsonPath(e.name), RepoSchema)),
  );
  return repos.filter((r): r is Repo => r !== null).toSorted((a, b) => a.addedAt - b.addedAt);
}

export async function getRepo(id: string): Promise<Repo | null> {
  return readJsonOrNull(repoJsonPath(id), RepoSchema);
}

export async function findRepoOrThrow(id: string): Promise<Repo> {
  const repo = await getRepo(id);
  if (!repo) throw new Error(`Unknown repo: ${id}`);
  return repo;
}

// Idempotent: re-adding the same path returns the same record (the id
// is a deterministic hash of the absolute path).
export async function addRepo(absolutePath: string): Promise<Repo> {
  if (!(await isGitRepo(absolutePath))) {
    throw new Error(`Not a git repository: ${absolutePath}`);
  }
  const id = repoIdFromPath(absolutePath);
  const existing = await getRepo(id);
  if (existing) return existing;
  const remoteUrl = await getOriginUrl(absolutePath);
  const repo: Repo = {
    id,
    name: basename(absolutePath),
    path: absolutePath,
    remoteUrl,
    addedAt: Date.now(),
  };
  await atomicWriteJson(repoJsonPath(id), RepoSchema.parse(repo));
  return repo;
}

export async function removeRepo(id: string): Promise<void> {
  // rm -rf the whole per-repo dir (config + diffs). The actual git
  // checkout on disk is untouched.
  await rm(repoDir(id), { recursive: true, force: true });
}

// Thin wrapper around the gh CLI. 30-second cache on readiness, JSON
// output for queries, and a single error type the renderer can
// translate into a toast. Uses execFile (no shell) so all args are
// passed as a vector with no string concatenation.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { ttlValueCache } from "./util/ttlCache";

const runFile = promisify(execFile);

export class GhNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhNotReadyError";
  }
}

export const GhReadinessSchema = z.object({
  installed: z.boolean(),
  authed: z.boolean(),
});
export type GhReadiness = z.infer<typeof GhReadinessSchema>;

async function checkInstalled(): Promise<boolean> {
  try {
    await runFile("gh", ["--version"], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function checkAuthed(): Promise<boolean> {
  try {
    // gh auth status exits non-zero when not authenticated.
    await runFile("gh", ["auth", "status"], { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

const readinessCache = ttlValueCache<GhReadiness>(30_000, async () => {
  const installed = await checkInstalled();
  if (!installed) return { installed: false, authed: false };
  const authed = await checkAuthed();
  return { installed, authed };
});

export function ghReadiness(): Promise<GhReadiness> {
  return readinessCache.get();
}

export function invalidateGhReadiness(): void {
  readinessCache.invalidate();
}

async function ensureReady(): Promise<void> {
  const r = await ghReadiness();
  if (!r.installed) throw new GhNotReadyError("GitHub CLI (gh) is not installed.");
  if (!r.authed) {
    throw new GhNotReadyError("GitHub CLI is not authenticated. Run `gh auth login`.");
  }
}

export const PullRequestSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  url: z.string().url(),
  headRefName: z.string(),
  baseRefName: z.string(),
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

const PullRequestListSchema = z.array(PullRequestSchema);

export async function listPullRequests(cwd: string): Promise<PullRequest[]> {
  await ensureReady();
  const { stdout } = await runFile(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      "50",
      "--json",
      "number,title,state,isDraft,url,headRefName,baseRefName",
    ],
    { cwd, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
  );
  return PullRequestListSchema.parse(JSON.parse(stdout));
}

export const PullRequestViewSchema = PullRequestSchema.extend({
  headRefOid: z.string(),
  baseRefOid: z.string(),
  // Present when state === "MERGED". Used to pick the correct three-dot
  // base (merge commit's first parent) so the diff still reads as "what
  // the PR changed" after the PR has landed.
  mergeCommit: z.object({ oid: z.string() }).nullable().optional(),
});
export type PullRequestView = z.infer<typeof PullRequestViewSchema>;

export async function viewPullRequest(cwd: string, number: number): Promise<PullRequestView> {
  await ensureReady();
  const { stdout } = await runFile(
    "gh",
    [
      "pr",
      "view",
      String(number),
      "--json",
      "number,title,state,isDraft,url,headRefName,baseRefName,headRefOid,baseRefOid,mergeCommit",
    ],
    { cwd, timeout: 10_000 },
  );
  return PullRequestViewSchema.parse(JSON.parse(stdout));
}

export async function checkoutPullRequest(cwd: string, number: number): Promise<void> {
  await ensureReady();
  await runFile("gh", ["pr", "checkout", String(number)], {
    cwd,
    timeout: 60_000,
  });
}

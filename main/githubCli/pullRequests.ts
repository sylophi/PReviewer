// PR queries via `gh pr list` / `gh pr view`. JSON output is parsed
// through zod so a shape change in gh becomes a loud error instead of
// a silent undefined downstream.
import { z } from "zod";
import { type PullRequestSummary, PullRequestSummarySchema } from "@shared/schemas";
import { runFile } from "./exec";
import { ensureReady } from "./readiness";

const PullRequestListSchema = z.array(PullRequestSummarySchema);

export async function listPullRequests(cwd: string): Promise<PullRequestSummary[]> {
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

export const PullRequestViewSchema = PullRequestSummarySchema.extend({
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

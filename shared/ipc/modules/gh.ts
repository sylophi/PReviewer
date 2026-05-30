import { z } from "zod";
import { invoke } from "@shared/ipc/contract";
import {
  GhReadinessSchema,
  ListPullRequestsPayloadSchema,
  PullRequestSummarySchema,
} from "@shared/schemas";

export const ghContract = {
  readiness: invoke("gh:readiness", z.void(), GhReadinessSchema),
  listPullRequests: invoke(
    "gh:listPullRequests",
    ListPullRequestsPayloadSchema,
    z.array(PullRequestSummarySchema),
  ),
} as const;

export type GhContract = typeof ghContract;

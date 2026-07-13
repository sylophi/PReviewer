import { z } from "zod";
import { invoke } from "@shared/ipc/contract";
import {
  CreateDiffFromPrPayloadSchema,
  CreateDiffPayloadSchema,
  DiffRefPayloadSchema,
  DiffSchema,
  ListDiffsPayloadSchema,
  ReadFilePayloadSchema,
  ReadFileResultSchema,
  ResolvedDiffSchema,
  ReviewedSnapshotPayloadSchema,
  ReviewedSnapshotResultSchema,
  SetPinPayloadSchema,
  SetReviewedPayloadSchema,
  WriteFilePayloadSchema,
} from "@shared/schemas";

export const diffsContract = {
  list: invoke("diffs:list", ListDiffsPayloadSchema, z.array(DiffSchema)),
  create: invoke("diffs:create", CreateDiffPayloadSchema, DiffSchema),
  get: invoke("diffs:get", DiffRefPayloadSchema, DiffSchema),
  delete: invoke("diffs:delete", DiffRefPayloadSchema, z.void()),
  resolve: invoke("diffs:resolve", DiffRefPayloadSchema, ResolvedDiffSchema),
  fullTree: invoke("diffs:fullTree", DiffRefPayloadSchema, z.array(z.string())),
  setReviewed: invoke("diffs:setReviewed", SetReviewedPayloadSchema, DiffSchema),
  setPin: invoke("diffs:setPin", SetPinPayloadSchema, DiffSchema),
  readFile: invoke("diffs:readFile", ReadFilePayloadSchema, ReadFileResultSchema),
  readReviewedSnapshot: invoke(
    "diffs:readReviewedSnapshot",
    ReviewedSnapshotPayloadSchema,
    ReviewedSnapshotResultSchema,
  ),
  writeFile: invoke("diffs:writeFile", WriteFilePayloadSchema, z.object({ ok: z.literal(true) })),
  createFromPullRequest: invoke(
    "diffs:createFromPullRequest",
    CreateDiffFromPrPayloadSchema,
    DiffSchema,
  ),
} as const;

export type DiffsContract = typeof diffsContract;

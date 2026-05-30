import { z } from "zod";
import { invoke } from "@shared/ipc/contract";
import {
  AddRepoPayloadSchema,
  RecentCommitSchema,
  RecentCommitsPayloadSchema,
  RemoveRepoPayloadSchema,
  RepoBranchesPayloadSchema,
  RepoBranchesSchema,
  RepoSchema,
  WorktreeSchema,
  WorktreesPayloadSchema,
} from "@shared/schemas";

export const reposContract = {
  list: invoke("repos:list", z.void(), z.array(RepoSchema)),
  add: invoke("repos:add", AddRepoPayloadSchema, RepoSchema),
  remove: invoke("repos:remove", RemoveRepoPayloadSchema, z.void()),
  branches: invoke(
    "repos:branches",
    RepoBranchesPayloadSchema,
    RepoBranchesSchema,
  ),
  recentCommits: invoke(
    "repos:recentCommits",
    RecentCommitsPayloadSchema,
    z.array(RecentCommitSchema),
  ),
  worktrees: invoke(
    "repos:worktrees",
    WorktreesPayloadSchema,
    z.array(WorktreeSchema),
  ),
} as const;

export type ReposContract = typeof reposContract;

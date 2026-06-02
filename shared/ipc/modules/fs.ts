import { z } from "zod";
import { invoke } from "@shared/ipc/contract";
import {
  DirectoryListingSchema,
  IsGitRepoPayloadSchema,
  ListDirectoryPayloadSchema,
  ScanForGitReposPayloadSchema,
} from "@shared/schemas";

export const fsContract = {
  listDirectory: invoke(
    "fs:listDirectory",
    ListDirectoryPayloadSchema,
    DirectoryListingSchema,
  ),
  isGitRepo: invoke("fs:isGitRepo", IsGitRepoPayloadSchema, z.boolean()),
  scanForGitRepos: invoke(
    "fs:scanForGitRepos",
    ScanForGitReposPayloadSchema,
    z.array(z.string()),
  ),
} as const;

export type FsContract = typeof fsContract;

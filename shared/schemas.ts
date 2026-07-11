// Zod schemas for IPC validation.
import { z } from "zod";

// Repo / diff ids are 12-hex short hashes (see main/util/id.ts). Payload
// schemas validate against the same shape the records enforce, because
// these ids are joined into filesystem paths under the app-data dir —
// an unvalidated "../.." id would escape it.
export const IdSchema = z.string().regex(/^[0-9a-f]{12}$/);

// Repo-relative file paths as git reports them. Rejects the shapes that
// would escape the worktree when joined onto it for fs reads/writes.
export const RelPathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.includes("\0") && !p.split("/").includes(".."), {
    message: "Expected a repo-relative path",
  });

export const ThemeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof ThemeSchema>;

export const SetThemePayloadSchema = z.object({
  theme: ThemeSchema,
});

export const EDITOR_FONT_SIZE_MIN = 9;
export const EDITOR_FONT_SIZE_MAX = 24;

export const EDITOR_LINE_HEIGHT_MIN = 1.1;
export const EDITOR_LINE_HEIGHT_MAX = 2.2;

// Rendered glyph weight for code. Monaco takes these as CSS
// font-weight strings; variable fonts interpolate the exact value.
export const EditorFontWeightSchema = z.enum(["300", "400", "450", "500", "600"]);
export type EditorFontWeight = z.infer<typeof EditorFontWeightSchema>;

export const EditorWhitespaceSchema = z.enum(["none", "boundary", "trailing", "all"]);
export type EditorWhitespace = z.infer<typeof EditorWhitespaceSchema>;

// Per-user global config under PReviewer's app-data directory. Every field is
// optional; absent means "use the built-in default". Read at startup
// (theme, synchronously, for the vibrancy material) and through the
// globalConfig IPC for everything else.
export const GlobalConfigSchema = z.object({
  theme: ThemeSchema.optional(),

  // Font. editorFontFamily is a free-form family name or CSS stack, VS
  // Code style — the app bundles no code font. Absent/empty = platform
  // default monospace. (Unknown keys from older configs — editorFont,
  // editorCustomFontFamily — are silently stripped by Zod on read.)
  editorFontFamily: z.string().max(200).optional(),
  editorFontSize: z.number().int().min(EDITOR_FONT_SIZE_MIN).max(EDITOR_FONT_SIZE_MAX).optional(),
  editorFontWeight: EditorFontWeightSchema.optional(),
  editorLineHeight: z.number().min(EDITOR_LINE_HEIGHT_MIN).max(EDITOR_LINE_HEIGHT_MAX).optional(),
  editorLigatures: z.boolean().optional(),

  // Editor rendering
  editorWordWrap: z.boolean().optional(),
  editorLineNumbers: z.boolean().optional(),
  editorMinimap: z.boolean().optional(),
  editorIndentGuides: z.boolean().optional(),
  editorWhitespace: EditorWhitespaceSchema.optional(),
  editorStickyScroll: z.boolean().optional(),
  editorTabSize: z.union([z.literal(2), z.literal(4), z.literal(8)]).optional(),

  // Diff behavior
  diffIgnoreTrimWhitespace: z.boolean().optional(),
  diffCollapseUnchanged: z.boolean().optional(),
  diffShowMoves: z.boolean().optional(),
});
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export const WriteGlobalConfigPayloadSchema = z.object({
  config: GlobalConfigSchema,
});

export const RuntimeInfoSchema = z.object({
  homedir: z.string().min(1),
  isDev: z.boolean(),
});
export type RuntimeInfo = z.infer<typeof RuntimeInfoSchema>;

export const ListDirectoryPayloadSchema = z.object({
  path: z.string().min(1),
});

export const IsGitRepoPayloadSchema = z.object({
  path: z.string().min(1),
});

export const ScanForGitReposPayloadSchema = z.object({
  path: z.string().min(1),
});

export const DirectoryEntrySchema = z.object({
  name: z.string(),
  isGitRepo: z.boolean(),
});
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>;

export const DirectoryListingSchema = z.object({
  path: z.string(),
  entries: z.array(DirectoryEntrySchema),
});
export type DirectoryListing = z.infer<typeof DirectoryListingSchema>;

export const PickFolderPayloadSchema = z
  .object({
    title: z.string().min(1).optional(),
    buttonLabel: z.string().min(1).optional(),
  })
  .optional();

// A registered repository. The `id` is a deterministic short hash of the
// absolute path so adding the same folder twice returns the same record.
export const RepoSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{12}$/),
  name: z.string().min(1),
  path: z.string().min(1),
  remoteUrl: z.string().min(1).nullable(),
  addedAt: z.number().int().nonnegative(),
});
export type Repo = z.infer<typeof RepoSchema>;

export const AddRepoPayloadSchema = z.object({
  path: z.string().min(1),
});

export const RemoveRepoPayloadSchema = z.object({
  id: IdSchema,
});

// Ref expressions. Each side of a diff is one of these.
export type RefExpr =
  | { kind: "branch"; name: string }
  | { kind: "commit"; hash: string }
  | { kind: "head" }
  | { kind: "workingTree" }
  | { kind: "mergeBase"; a: RefExpr; b: RefExpr };

const LeafRefExprSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("branch"), name: z.string().min(1) }),
  z.object({ kind: z.literal("commit"), hash: z.string().min(1) }),
  z.object({ kind: z.literal("head") }),
  z.object({ kind: z.literal("workingTree") }),
]);

export const RefExprSchema: z.ZodType<RefExpr> = z.lazy(() =>
  z.union([
    LeafRefExprSchema,
    z.object({
      kind: z.literal("mergeBase"),
      a: RefExprSchema,
      b: RefExprSchema,
    }),
  ]),
);

export const RepoBranchesSchema = z.object({
  local: z.array(z.string()),
  remote: z.array(z.string()),
  currentBranch: z.string().nullable(),
});
export type RepoBranches = z.infer<typeof RepoBranchesSchema>;

export const RepoBranchesPayloadSchema = z.object({
  repoId: IdSchema,
});

export const RecentCommitSchema = z.object({
  hash: z.string().min(1),
  shortHash: z.string().min(1),
  subject: z.string(),
});
export type RecentCommit = z.infer<typeof RecentCommitSchema>;

export const RecentCommitsPayloadSchema = z.object({
  repoId: IdSchema,
});

export const WorktreeSchema = z.object({
  path: z.string().min(1),
  head: z.string().min(1),
  branch: z.string().nullable(),
  detached: z.boolean(),
  isMain: z.boolean(),
  locked: z.boolean(),
});
export type Worktree = z.infer<typeof WorktreeSchema>;

export const WorktreesPayloadSchema = z.object({
  repoId: IdSchema,
});

// A persistent diff. The `reviewed` map stores the content hash of each
// file at the time it was checked off so we can flag "needs re-review"
// when the right side moves.
export const DiffSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{12}$/),
  repoId: z.string().regex(/^[0-9a-f]{12}$/),
  name: z.string().min(1),
  left: RefExprSchema,
  right: RefExprSchema,
  // Optional. Binds the right side's working-tree resolution (reads,
  // writes, HEAD, "is live" checks) to this worktree. When unset, the
  // repo's main path is used so pre-worktree diffs keep working.
  rightWorktreePath: z.string().min(1).optional(),
  // Set on diffs created from a PR. Records which PR the private
  // refs/previewer/pull/<n> keep-alive ref belongs to, so deleting the
  // diff can prune the ref once no other diff needs it.
  prNumber: z.number().int().positive().optional(),
  // When set, the diff freezes to these commit hashes regardless of
  // where the underlying refs move. Pin/unpin toggles this.
  pinned: z
    .object({
      leftHash: z.string().min(1).nullable(),
      rightHash: z.string().min(1).nullable(),
    })
    .nullable(),
  reviewed: z.record(
    z.string(),
    z.object({
      hash: z.string().min(1),
      markedAt: z.number().int().nonnegative(),
    }),
  ),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type Diff = z.infer<typeof DiffSchema>;

export const CreateDiffPayloadSchema = z.object({
  repoId: IdSchema,
  name: z.string().min(1).optional(),
  left: RefExprSchema,
  right: RefExprSchema,
  rightWorktreePath: z.string().min(1).optional(),
});

export const DiffRefPayloadSchema = z.object({
  repoId: IdSchema,
  diffId: IdSchema,
});

export const ListDiffsPayloadSchema = z.object({
  repoId: IdSchema,
});

export const FileChangeKindSchema = z.enum([
  "added",
  "modified",
  "deleted",
  "renamed",
  "untracked",
  "binary",
]);
export type FileChangeKind = z.infer<typeof FileChangeKindSchema>;

export const FileChangeSchema = z.object({
  path: z.string(),
  fromPath: z.string(),
  kind: FileChangeKindSchema,
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  reviewed: z.boolean(),
  needsReReview: z.boolean(),
});
export type FileChange = z.infer<typeof FileChangeSchema>;

export const ResolvedDiffSchema = z.object({
  diff: DiffSchema,
  leftCommit: z.string().nullable(),
  rightCommit: z.string().nullable(),
  patch: z.string(),
  files: z.array(FileChangeSchema),
});
export type ResolvedDiff = z.infer<typeof ResolvedDiffSchema>;

export const SetReviewedPayloadSchema = z.object({
  repoId: IdSchema,
  diffId: IdSchema,
  path: RelPathSchema,
  reviewed: z.boolean(),
});

export const SetPinPayloadSchema = z.object({
  repoId: IdSchema,
  diffId: IdSchema,
  pinned: z.boolean(),
});

export const ReadFilePayloadSchema = z.object({
  repoId: IdSchema,
  diffId: IdSchema,
  path: RelPathSchema,
  // "left" reads at the diff's left ref, "right" at the right ref.
  side: z.enum(["left", "right"]),
});

export const ReadFileResultSchema = z.object({
  content: z.string().nullable(),
  editable: z.boolean(),
});
export type ReadFileResult = z.infer<typeof ReadFileResultSchema>;

// Content of the right side as it was when the file was marked reviewed
// (recovered from the stored blob hash). Null when the file was never
// marked, the mark predates snapshot support, or git gc pruned the blob.
export const ReviewedSnapshotPayloadSchema = z.object({
  repoId: IdSchema,
  diffId: IdSchema,
  path: RelPathSchema,
});

export const ReviewedSnapshotResultSchema = z.object({
  content: z.string().nullable(),
});
export type ReviewedSnapshotResult = z.infer<typeof ReviewedSnapshotResultSchema>;

export const WriteFilePayloadSchema = z.object({
  repoId: IdSchema,
  diffId: IdSchema,
  path: RelPathSchema,
  content: z.string(),
});

export const GhReadinessSchema = z.object({
  installed: z.boolean(),
  authed: z.boolean(),
});
export type GhReadiness = z.infer<typeof GhReadinessSchema>;

export const PullRequestSummarySchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean(),
  url: z.string().url(),
  headRefName: z.string(),
  baseRefName: z.string(),
});
export type PullRequestSummary = z.infer<typeof PullRequestSummarySchema>;

export const ListPullRequestsPayloadSchema = z.object({
  repoId: IdSchema,
});

export const CreateDiffFromPrPayloadSchema = z.object({
  repoId: IdSchema,
  number: z.number().int().positive(),
  // Worktree the diff binds to on disk. Same semantics as
  // CreateDiffPayload.rightWorktreePath: omit for the main worktree,
  // set the absolute path for a non-main checkout. PR head SHAs are
  // global so this doesn't change the resolved diff; it only changes
  // where git commands run and which checkout edits would land in.
  rightWorktreePath: z.string().min(1).optional(),
});

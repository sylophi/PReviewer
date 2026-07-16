import {
  type QueryClient,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Diff, RefExpr, Repo, ResolvedDiff } from "@shared/schemas";
import { queryKeys } from "@/lib/queryKeys";

export function useDiffs(repoId: string) {
  return useQuery({
    queryKey: queryKeys.diffsForRepo(repoId),
    queryFn: () => window.api.diffs.list(repoId),
  });
}

export interface DiffWithRepo {
  diff: Diff;
  repo: Repo;
}

// Aggregates diffs across all repos for cross-repo dashboard bands
// (Pinned strip, In progress band). Shares the per-repo cache with
// useDiffs so opening a repo section doesn't refetch.
export function useAllDiffs(repos: Repo[]) {
  const queries = useQueries({
    queries: repos.map((repo) => ({
      queryKey: queryKeys.diffsForRepo(repo.id),
      queryFn: () => window.api.diffs.list(repo.id),
    })),
  });
  const items: DiffWithRepo[] = [];
  queries.forEach((q, idx) => {
    const repo = repos[idx];
    if (!repo) return;
    for (const diff of q.data ?? []) {
      items.push({ diff, repo });
    }
  });
  return { items, isLoading: queries.some((q) => q.isLoading) };
}

// Shared options so every observer of a resolved diff (DiffView, cards,
// dashboard progress bands) hits the same cache entry with identical
// semantics.
export function resolvedDiffQueryOptions(repoId: string, diffId: string) {
  return {
    queryKey: queryKeys.resolvedDiff(repoId, diffId),
    queryFn: () => window.api.diffs.resolve({ repoId, diffId }),
    // Fresh forever between events we control: mount and the mutations
    // that invalidate this key. Resolving is expensive (a full git diff
    // + numstat + per-file blob hashing), so nothing refetches it on a
    // timer.
    staleTime: Number.POSITIVE_INFINITY,
  } as const;
}

// `live` forces a refetch whenever the window regains focus: coming
// back from the terminal or an agent session is exactly when the
// working tree has moved and needs-re-review must update. Only the diff
// the user is actually reading opts in — the dashboard holds one of
// these queries per diff, and forcing them all would fire a git diff
// per saved diff on every ⌘Tab.
export function useResolvedDiff(
  repoId: string | null,
  diffId: string | null,
  opts: { live?: boolean } = {},
) {
  return useQuery({
    ...resolvedDiffQueryOptions(repoId ?? "", diffId ?? ""),
    enabled: repoId !== null && diffId !== null,
    ...(opts.live ? { refetchOnWindowFocus: "always" as const } : {}),
  });
}

export function invalidateDiffs(queryClient: QueryClient, repoId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.diffsForRepo(repoId) });
}

export function invalidateResolvedDiff(
  queryClient: QueryClient,
  repoId: string,
  diffId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.resolvedDiff(repoId, diffId),
  });
}

interface CreateDiffArgs {
  repoId: string;
  name?: string;
  left: RefExpr;
  right: RefExpr;
  rightWorktreePath?: string;
}

export function useCreateDiff() {
  const queryClient = useQueryClient();
  return useMutation<Diff, Error, CreateDiffArgs>({
    mutationFn: (args) => window.api.diffs.create(args),
    meta: { errorTitle: "Couldn't create diff" },
    onSuccess: (diff) => invalidateDiffs(queryClient, diff.repoId),
  });
}

interface DeleteDiffArgs {
  repoId: string;
  diffId: string;
}

export function useDeleteDiff() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteDiffArgs>({
    mutationFn: (args) => window.api.diffs.delete(args),
    meta: { errorTitle: "Couldn't delete diff" },
    onSuccess: (_void, args) => invalidateDiffs(queryClient, args.repoId),
  });
}

interface SetReviewedArgs {
  repoId: string;
  diffId: string;
  path: string;
  reviewed: boolean;
}

export function useSetReviewed() {
  const queryClient = useQueryClient();
  return useMutation<Diff, Error, SetReviewedArgs>({
    mutationFn: (args) => window.api.diffs.setReviewed(args),
    meta: { errorTitle: "Couldn't update review state" },
    onSuccess: (diff, args) => {
      invalidateResolvedDiff(queryClient, diff.repoId, diff.id);
      // Re-marking updates the stored snapshot hash; drop the cached
      // snapshot content so the "since review" view reads the new one.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.reviewedSnapshot(diff.repoId, diff.id, args.path),
      });
    },
  });
}

interface SetPinArgs {
  repoId: string;
  diffId: string;
  pinned: boolean;
}

export function useSetPin() {
  const queryClient = useQueryClient();
  return useMutation<Diff, Error, SetPinArgs>({
    mutationFn: (args) => window.api.diffs.setPin(args),
    meta: { errorTitle: "Couldn't pin diff" },
    onSuccess: (diff) => {
      invalidateResolvedDiff(queryClient, diff.repoId, diff.id);
      invalidateDiffs(queryClient, diff.repoId);
    },
  });
}

export type { Diff, ResolvedDiff };

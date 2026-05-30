import {
  type QueryClient,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Diff, RefExpr, Repo, ResolvedDiff } from "@shared/schemas";

const diffsKey = (repoId: string) => ["diffs", repoId] as const;
const diffKey = (repoId: string, diffId: string) => ["diff", repoId, diffId] as const;
const resolvedDiffKey = (repoId: string, diffId: string) =>
  ["diff", repoId, diffId, "resolved"] as const;

export function useDiffs(repoId: string) {
  return useQuery({
    queryKey: diffsKey(repoId),
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
      queryKey: diffsKey(repo.id),
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

export function useDiff(repoId: string, diffId: string) {
  return useQuery({
    queryKey: diffKey(repoId, diffId),
    queryFn: () => window.api.diffs.get({ repoId, diffId }),
  });
}

export function useResolvedDiff(repoId: string | null, diffId: string | null) {
  return useQuery({
    queryKey: resolvedDiffKey(repoId ?? "", diffId ?? ""),
    queryFn: () => window.api.diffs.resolve({ repoId: repoId!, diffId: diffId! }),
    enabled: repoId !== null && diffId !== null,
    // External git changes (terminal commits, branch switches) won't
    // trigger a refetch; mutations explicitly invalidate this key.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function invalidateDiffs(queryClient: QueryClient, repoId: string): void {
  void queryClient.invalidateQueries({ queryKey: diffsKey(repoId) });
}

export function invalidateResolvedDiff(
  queryClient: QueryClient,
  repoId: string,
  diffId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: resolvedDiffKey(repoId, diffId),
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
    onSuccess: (diff) => {
      invalidateResolvedDiff(queryClient, diff.repoId, diff.id);
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

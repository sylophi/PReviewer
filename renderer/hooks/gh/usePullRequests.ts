import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Diff, GhReadiness, PullRequestSummary } from "@shared/schemas";
import { invalidateDiffs } from "@/hooks/diffs/useDiffs";

export function useGhReadiness() {
  return useQuery<GhReadiness>({
    queryKey: ["gh", "readiness"],
    queryFn: () => window.api.gh.readiness(),
    // The user may install / log into gh while the app is open. 30s ttl
    // matches the main-process cache.
    staleTime: 30_000,
  });
}

export function usePullRequests(repoId: string | null) {
  return useQuery<PullRequestSummary[]>({
    queryKey: ["gh", "prList", repoId],
    queryFn: () => window.api.gh.listPullRequests(repoId!),
    enabled: repoId !== null,
    // PRs change less than refs do; the dialog re-opens often enough.
    staleTime: 60_000,
  });
}

export function useCreateDiffFromPullRequest() {
  const queryClient = useQueryClient();
  return useMutation<Diff, Error, { repoId: string; number: number }>({
    mutationFn: ({ repoId, number }) => window.api.diffs.createFromPullRequest({ repoId, number }),
    meta: { errorTitle: "Couldn't open PR" },
    onSuccess: (diff) => invalidateDiffs(queryClient, diff.repoId),
  });
}

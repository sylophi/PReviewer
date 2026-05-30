import { useQuery } from "@tanstack/react-query";
import type { RecentCommit } from "@shared/schemas";
import { queryKeys } from "@/lib/queryKeys";

export function useRecentCommits(repoId: string | null) {
  return useQuery<RecentCommit[]>({
    queryKey: queryKeys.repoRecentCommits(repoId),
    queryFn: () => window.api.repos.recentCommits(repoId ?? ""),
    enabled: repoId !== null && repoId !== "",
  });
}

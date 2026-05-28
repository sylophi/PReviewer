import { useQuery } from "@tanstack/react-query";
import type { RecentCommit } from "@shared/schemas";

export function useRecentCommits(repoId: string | null) {
  return useQuery<RecentCommit[]>({
    queryKey: ["repo", repoId, "recentCommits"],
    queryFn: () => window.api.repos.recentCommits(repoId ?? ""),
    enabled: repoId !== null && repoId !== "",
  });
}

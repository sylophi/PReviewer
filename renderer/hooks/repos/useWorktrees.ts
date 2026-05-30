import { useQuery } from "@tanstack/react-query";
import type { Worktree } from "@shared/schemas";
import { queryKeys } from "@/lib/queryKeys";

export function useWorktrees(repoId: string | null) {
  return useQuery<Worktree[]>({
    queryKey: queryKeys.repoWorktrees(repoId),
    queryFn: () => window.api.repos.worktrees(repoId ?? ""),
    enabled: repoId !== null && repoId !== "",
  });
}

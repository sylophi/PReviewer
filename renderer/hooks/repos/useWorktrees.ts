import { useQuery } from "@tanstack/react-query";
import type { Worktree } from "@shared/schemas";

export function useWorktrees(repoId: string | null) {
  return useQuery<Worktree[]>({
    queryKey: ["repo", repoId, "worktrees"],
    queryFn: () => window.api.repos.worktrees(repoId ?? ""),
    enabled: repoId !== null && repoId !== "",
  });
}

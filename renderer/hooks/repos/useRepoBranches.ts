import { useQuery } from "@tanstack/react-query";

export function useRepoBranches(repoId: string | null) {
  return useQuery({
    queryKey: ["repoBranches", repoId],
    queryFn: () => window.api.repos.branches(repoId!),
    enabled: repoId !== null,
  });
}

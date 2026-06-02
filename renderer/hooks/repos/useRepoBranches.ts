import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export function useRepoBranches(repoId: string | null) {
  return useQuery({
    queryKey: queryKeys.repoBranches(repoId),
    queryFn: () => window.api.repos.branches(repoId!),
    enabled: repoId !== null,
  });
}

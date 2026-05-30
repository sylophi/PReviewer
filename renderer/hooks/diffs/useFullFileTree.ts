import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

export function useFullFileTree(repoId: string, diffId: string) {
  return useQuery({
    queryKey: queryKeys.fullFileTree(repoId, diffId),
    queryFn: () => window.api.diffs.fullTree({ repoId, diffId }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

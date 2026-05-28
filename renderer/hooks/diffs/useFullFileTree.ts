import { useQuery } from "@tanstack/react-query";

export function useFullFileTree(repoId: string, diffId: string) {
  return useQuery({
    queryKey: ["diff", repoId, diffId, "fullTree"],
    queryFn: () => window.api.diffs.fullTree({ repoId, diffId }),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

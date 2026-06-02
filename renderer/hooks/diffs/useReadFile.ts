import { useQuery } from "@tanstack/react-query";
import type { ReadFileResult } from "@shared/schemas";
import { queryKeys } from "@/lib/queryKeys";

export function useReadFile(
  repoId: string,
  diffId: string,
  path: string | null,
  side: "left" | "right",
) {
  return useQuery<ReadFileResult>({
    queryKey: queryKeys.readFile(repoId, diffId, path, side),
    queryFn: () => window.api.diffs.readFile({ repoId, diffId, path: path!, side }),
    enabled: path !== null,
    // External file changes don't trigger refetch; invalidate explicitly.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

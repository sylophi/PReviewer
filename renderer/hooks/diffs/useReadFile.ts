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
    // Fresh between our own invalidations, but re-read on window focus
    // so external edits (agents, terminal) reach open tabs. The editor
    // only adopts refetched content when the buffer has no pending
    // local edits (see DiffEditorBody).
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: "always",
  });
}

import { useQuery } from "@tanstack/react-query";
import type { RuntimeInfo } from "@shared/schemas";
import { queryKeys } from "@/lib/queryKeys";

// Static for the process lifetime (versions, paths), so cache forever.
export function useRuntimeInfo() {
  return useQuery<RuntimeInfo>({
    queryKey: queryKeys.runtimeInfo(),
    queryFn: () => window.api.runtime.info(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

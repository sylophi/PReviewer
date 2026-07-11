import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GlobalConfig } from "@shared/schemas";
import { queryKeys } from "@/lib/queryKeys";

export function useGlobalConfig() {
  return useQuery<GlobalConfig>({
    queryKey: queryKeys.globalConfig(),
    queryFn: () => window.api.globalConfig.read(),
    // Config only changes through our own writes, which invalidate the
    // key; no external mutator to refetch for.
    staleTime: Number.POSITIVE_INFINITY,
    meta: { errorTitle: "Couldn't load settings" },
  });
}

// Serializes config writes so rapid patches can't land out of order on
// disk. Each queued write carries a superset of the previous one (the
// cache merge below happens synchronously), so the last write is
// always the most complete.
let writeChain: Promise<void> = Promise.resolve();

// Merge a partial into the saved config and persist the whole object
// (the IPC replaces the file wholesale). The merged result is pushed
// into the query cache *synchronously*, before the disk write — a
// second patch fired while the first is still in flight reads the
// already-merged state instead of the stale cache. (Reading the cache
// only after invalidate/refetch made rapid successive patches clobber
// each other: they'd all merge into the same old snapshot and the last
// write won.)
export function useGlobalConfigPatch() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, Partial<GlobalConfig>>({
    mutationFn: async (patch) => {
      const current = queryClient.getQueryData<GlobalConfig>(queryKeys.globalConfig()) ?? {};
      const next = { ...current, ...patch };
      queryClient.setQueryData(queryKeys.globalConfig(), next);
      writeChain = writeChain.then(() => window.api.globalConfig.write(next));
      await writeChain;
    },
    meta: { errorTitle: "Couldn't save settings" },
    onError: () => {
      // The optimistic cache may now disagree with disk; resync.
      writeChain = Promise.resolve();
      void queryClient.invalidateQueries({ queryKey: queryKeys.globalConfig() });
    },
  });
}

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

// Merge a partial into the saved config and persist the whole object
// (the IPC replaces the file wholesale). Reading the current value from
// the query cache inside mutationFn — rather than closing over a
// useGlobalConfig() result — keeps rapid successive patches from each
// clobbering the others' fields.
export function useGlobalConfigPatch() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, Partial<GlobalConfig>>({
    mutationFn: async (patch) => {
      const current = queryClient.getQueryData<GlobalConfig>(queryKeys.globalConfig()) ?? {};
      await window.api.globalConfig.write({ ...current, ...patch });
    },
    meta: { errorTitle: "Couldn't save settings" },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.globalConfig() });
    },
  });
}

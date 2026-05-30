import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { invalidateResolvedDiff } from "./useDiffs";

interface WriteFileArgs {
  repoId: string;
  diffId: string;
  path: string;
  content: string;
}

export function useWriteFile() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: true }, Error, WriteFileArgs>({
    mutationFn: (args) => window.api.diffs.writeFile(args),
    meta: { errorTitle: "Couldn't save file" },
    onSuccess: (_data, args) => {
      // Refetch the right-side content so the editor reflects the
      // on-disk truth, and refresh the resolved diff so additions /
      // deletions / needs-re-review re-compute against the new blob.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.readFile(args.repoId, args.diffId, args.path, "right"),
      });
      invalidateResolvedDiff(queryClient, args.repoId, args.diffId);
    },
  });
}

import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Repo } from "@shared/schemas";
import { queryKeys } from "@/lib/queryKeys";

export function useRepos() {
  return useQuery({
    queryKey: queryKeys.repos(),
    queryFn: () => window.api.repos.list(),
  });
}

export function invalidateRepos(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.repos() });
}

interface AddRepoArgs {
  path: string;
}

export function useAddRepo() {
  const queryClient = useQueryClient();
  return useMutation<Repo, Error, AddRepoArgs>({
    mutationFn: ({ path }) => window.api.repos.add(path),
    meta: { errorTitle: "Couldn't add repo" },
    onSuccess: () => invalidateRepos(queryClient),
  });
}

export function useRemoveRepo() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => window.api.repos.remove(id),
    meta: { errorTitle: "Couldn't remove repo" },
    onSuccess: () => invalidateRepos(queryClient),
  });
}

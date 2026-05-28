import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Repo } from "@shared/schemas";

const REPOS_KEY = ["repos"] as const;

export function useRepos() {
  return useQuery({
    queryKey: REPOS_KEY,
    queryFn: () => window.api.repos.list(),
  });
}

export function invalidateRepos(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: REPOS_KEY });
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

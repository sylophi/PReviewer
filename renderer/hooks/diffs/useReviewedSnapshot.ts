import { useQuery } from "@tanstack/react-query";
import type { ReviewedSnapshotResult } from "@shared/schemas";
import { queryKeys } from "@/lib/queryKeys";

// Content of the right side as it was when the file was marked
// reviewed. Powers the "changes since review" toggle: the diff flips
// from `left ↔ right` to `reviewed-snapshot ↔ right`. content is null
// when the snapshot isn't recoverable (mark predates snapshot support,
// or git gc pruned the unreferenced blob).
export function useReviewedSnapshot(
  repoId: string,
  diffId: string,
  path: string,
  enabled: boolean,
) {
  return useQuery<ReviewedSnapshotResult>({
    queryKey: queryKeys.reviewedSnapshot(repoId, diffId, path),
    queryFn: () => window.api.diffs.readReviewedSnapshot({ repoId, diffId, path }),
    enabled,
    // The snapshot only changes when the file is re-marked reviewed,
    // which invalidates this key explicitly (see useSetReviewed).
    staleTime: Number.POSITIVE_INFINITY,
  });
}

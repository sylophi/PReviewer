import { Skeleton } from "../ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingSkeleton({ width }: { width: number }) {
  return (
    <aside
      style={{ width }}
      className="shrink-0 border-r border-border bg-card/30 p-3"
    >
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className={cn("h-5", i % 2 ? "w-3/4" : "w-2/3")} />
        ))}
      </div>
    </aside>
  );
}

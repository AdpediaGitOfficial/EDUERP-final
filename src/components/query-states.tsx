import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Standard "this didn't load" state for a failed react-query fetch. Explains
 * the failure and offers a retry, instead of an empty area or raw error text.
 *
 *   const { data, isError, refetch } = useQuery(...)
 *   if (isError) return <QueryError onRetry={refetch} />
 */
export function QueryError({
  title = "Couldn't load this",
  hint = "Something went wrong fetching the data. Check your connection and try again.",
  onRetry,
  className,
}: {
  title?: string;
  hint?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-14", className)}>
      <div className="size-11 rounded-2xl bg-red-100 grid place-items-center text-red-600 mb-3">
        <AlertTriangle className="size-5" />
      </div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground max-w-xs">{hint}</div>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => onRetry()}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** A grid of stat-card skeletons matching the dashboard KPI layout. */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 rounded-2xl border bg-card">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Rows of table skeletons, shaped like the eventual content (no layout jump). */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-5", c === 0 ? "w-40" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

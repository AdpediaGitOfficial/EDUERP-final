import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Card } from "@/components/ui/card";
import { Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hr/performance")({ component: Page });

function Page() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["performance-reviews"],
    queryFn: () => apiGet<any[]>("/hr/performance-reviews"),
  });
  const avg =
    data && data.length
      ? (data.reduce((a: number, r: any) => a + Number(r.rating || 0), 0) / data.length).toFixed(2)
      : "—";
  return (
    <>
      <PageHeader title="Performance Reviews" subtitle="KPI-based reviews and appraisals." />
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Total reviews</div>
          <div className="text-2xl font-semibold">{(data ?? []).length}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Avg rating</div>
          <div className="text-2xl font-semibold flex items-center gap-1">
            {avg}
            <Star className="size-5 text-amber-500 fill-amber-500" />
          </div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Top rated (≥4.5)</div>
          <div className="text-2xl font-semibold text-emerald-600">
            {(data ?? []).filter((r: any) => Number(r.rating) >= 4.5).length}
          </div>
        </Card>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Employee</th>
              <th className="p-3">Period</th>
              <th className="p-3">Rating</th>
              <th className="p-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-3">{r.teacher?.full_name}</td>
                <td className="p-3">{r.period}</td>
                <td className="p-3">
                  <span className="font-semibold">{r.rating}</span> / 5
                </td>
                <td className="p-3 text-xs text-muted-foreground">{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </Card>
    </>
  );
}

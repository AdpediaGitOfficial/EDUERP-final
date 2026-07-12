import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/hr/reports")({ component: Page });

const REPORTS = [
  { key: "employees", label: "Employee master", table: "staff" },
  { key: "attendance", label: "Attendance", table: "teacher_attendance" },
  { key: "payroll", label: "Payroll", table: "payroll_runs" },
  { key: "leave", label: "Leave", table: "leave_requests" },
  { key: "performance", label: "Performance", table: "teacher_performance_reviews" },
  { key: "recruitment", label: "Recruitment", table: "candidates" },
  { key: "training", label: "Training", table: "training_programs" },
  { key: "resignation", label: "Resignation", table: "resignations" },
  { key: "expenses", label: "Expense claims", table: "expense_claims" },
] as const;

function Page() {
  const [selected, setSelected] = useState<(typeof REPORTS)[number]>(REPORTS[0]);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["report", selected.key],
    queryFn: () => apiGet<any[]>(`/hr/reports/${selected.key}`),
  });
  const rows = (data ?? []) as any[];
  const cols = rows[0]
    ? Object.keys(rows[0])
        .filter((k) => !["id"].includes(k))
        .slice(0, 8)
    : [];

  const exportCSV = () => {
    if (!rows.length) return;
    const header = cols.join(",");
    const body = rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selected.key}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader title="Reports" subtitle="Cross-module HR reports with CSV export." />
      <div className="flex flex-wrap gap-2 mb-4">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => setSelected(r)}
            className={`px-3 py-1.5 rounded-full text-sm border ${selected.key === r.key ? "bg-primary text-primary-foreground" : "bg-background"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-muted-foreground">{rows.length} rows</div>
        <Button size="sm" onClick={exportCSV}>
          <Download className="size-4 mr-1" /> Export CSV
        </Button>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="p-2 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i} className="border-t">
                  {cols.map((c) => (
                    <td key={c} className="p-2 truncate max-w-[200px]">
                      {typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Download, Printer, FileBarChart } from "lucide-react";
import { downloadCsv } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/academics/reports")({ component: Page });

type Catalogue = { key: string; label: string }[];
type Report = {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, any>[];
};

function Page() {
  const [type, setType] = useState("class_strength");

  const { data: catalogue } = useQuery({
    queryKey: ["report-catalogue"],
    queryFn: () => apiGet<Catalogue>("/academics/reports"),
  });
  const {
    data: report,
    isFetching,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["academic-report", type],
    queryFn: () => apiGet<Report>(`/academics/reports/${type}`),
  });

  const exportCsv = () => {
    if (!report) return;
    const rows = report.rows.map((r) => {
      const o: Record<string, any> = {};
      for (const c of report.columns) o[c.label] = r[c.key];
      return o;
    });
    downloadCsv(rows, report.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase());
  };

  const print = () => {
    if (!report) return;
    const head = report.columns.map((c) => `<th>${c.label}</th>`).join("");
    const body = report.rows
      .map((r) => `<tr>${report.columns.map((c) => `<td>${r[c.key] ?? ""}</td>`).join("")}</tr>`)
      .join("");
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${report.title}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;color:#111}
        h1{font-size:18px;margin:0 0 4px}
        .meta{color:#666;font-size:12px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}
        th{background:#f3f4f6}
      </style></head><body>
      <h1>${report.title}</h1>
      <div class="meta">Greenwood School · ${report.rows.length} rows · generated ${new Date().toLocaleString()}</div>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(catalogue ?? []).map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={exportCsv}
          disabled={!report || report.rows.length === 0}
        >
          <Download className="size-4 mr-1" />
          Export CSV
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={print}
          disabled={!report || report.rows.length === 0}
        >
          <Printer className="size-4 mr-1" />
          Print
        </Button>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <FileBarChart className="size-4" />
          <h3 className="font-semibold">{report?.title ?? "Report"}</h3>
          {report && (
            <span className="text-sm text-muted-foreground ml-auto">{report.rows.length} rows</span>
          )}
        </div>
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : report && report.rows.length === 0 && !isFetching ? (
          <EmptyState
            icon={FileBarChart}
            title="No data"
            hint="This report has no rows for the current session."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  {(report?.columns ?? []).map((c) => (
                    <th key={c.key} className="p-3 font-medium whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(report?.rows ?? []).map((r, i) => (
                  <tr key={i} className="border-t hover:bg-muted/30">
                    {(report?.columns ?? []).map((c) => (
                      <td key={c.key} className="p-3 whitespace-nowrap">
                        {String(r[c.key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

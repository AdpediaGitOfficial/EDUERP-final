import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, subDays } from "date-fns";
import { Download, Printer, FileSpreadsheet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports-generator")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <Page />
    </RequireRole>
  ),
});

type ReportType = "attendance" | "fees" | "students" | "complaints";

function toCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join(
    "\n",
  );
}

function download(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Page() {
  const [type, setType] = useState<ReportType>("attendance");
  const [from, setFrom] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data, isFetching, refetch } = useQuery<Record<string, any>[]>({
    queryKey: ["rg", type, from, to],
    queryFn: () =>
      apiGet<Record<string, any>[]>(`/reports/generator?type=${type}&from=${from}&to=${to}`),
  });

  const rows = data ?? [];
  const headers = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);

  return (
    <AppShell>
      <PageHeader
        title="Reports Generator"
        subtitle="Filter by type and date range, then export as CSV or print to PDF."
        action={
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Print / PDF
            </Button>
            <Button
              onClick={() => download(`${type}-${from}-to-${to}.csv`, toCSV(rows))}
              disabled={!rows.length}
            >
              <Download className="size-4" /> Download CSV
            </Button>
          </div>
        }
      />

      <Card className="rounded-2xl p-4 mb-6 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label>Report type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attendance">Attendance</SelectItem>
                <SelectItem value="fees">Fee payments</SelectItem>
                <SelectItem value="students">Student admissions</SelectItem>
                <SelectItem value="complaints">Complaints</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button variant="secondary" onClick={() => refetch()} className="w-full">
              Run
            </Button>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <FileSpreadsheet className="size-4" />
            <span className="capitalize">{type}</span> · {from} → {to}
          </div>
          <div className="text-xs text-muted-foreground">
            {rows.length} row{rows.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground">
              <tr className="text-left">
                {headers.map((h) => (
                  <th key={h} className="p-3 font-medium capitalize whitespace-nowrap">
                    {h.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  {headers.map((h) => (
                    <td key={h} className="p-3 whitespace-nowrap">
                      {r[h] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
              {!isFetching && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={Math.max(1, headers.length)}
                    className="p-10 text-center text-sm text-muted-foreground"
                  >
                    No data for the selected range.
                  </td>
                </tr>
              )}
              {isFetching && (
                <tr>
                  <td
                    colSpan={Math.max(1, headers.length)}
                    className="p-10 text-center text-sm text-muted-foreground"
                  >
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

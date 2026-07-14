import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/query-states";
import { inr } from "@/components/fees-collection";
import { downloadCsv } from "@/lib/module-util";
import { Download, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/reports")({
  component: ReportsPage,
});

const REPORTS = [
  { value: "daily", label: "Daily Collection", kind: "collection", groupBy: "day" },
  { value: "monthly", label: "Monthly Collection", kind: "collection", groupBy: "month" },
  { value: "classwise", label: "Class-wise Collection", kind: "collection", groupBy: "class" },
  { value: "feegroup", label: "Fee Group Report", kind: "feegroup", groupBy: "" },
] as const;

type CollectionReport = {
  groupBy: string;
  rows: { key: string; label: string; count: number; amount: number }[];
  total: number;
  count: number;
};
type FeeGroupReport = {
  rows: {
    groupId: string | null;
    groupName: string;
    lines: number;
    assigned: number;
    collected: number;
    outstanding: number;
  }[];
  totals: { assigned: number; collected: number; outstanding: number };
};

function ReportsPage() {
  const [report, setReport] = useState<string>("daily");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const cfg = REPORTS.find((r) => r.value === report)!;

  const collection = useQuery<CollectionReport>({
    enabled: cfg.kind === "collection",
    queryKey: ["report-collection", cfg.groupBy, from, to],
    queryFn: () =>
      apiGet<CollectionReport>(
        `/fees/reports/collection?groupBy=${cfg.groupBy}${from ? `&from=${from}` : ""}${
          to ? `&to=${to}` : ""
        }`,
      ),
  });
  const feeGroup = useQuery<FeeGroupReport>({
    enabled: cfg.kind === "feegroup",
    queryKey: ["report-feegroup"],
    queryFn: () => apiGet<FeeGroupReport>("/fees/reports/fee-groups"),
  });

  const loading = cfg.kind === "collection" ? collection.isLoading : feeGroup.isLoading;

  const exportCsv = () => {
    if (cfg.kind === "collection") {
      const rows = collection.data?.rows ?? [];
      downloadCsv(
        rows.map((r) => ({ Group: r.label, Receipts: r.count, Amount: r.amount })),
        `${report}-collection`,
      );
    } else {
      const rows = feeGroup.data?.rows ?? [];
      downloadCsv(
        rows.map((r) => ({
          FeeGroup: r.groupName,
          Lines: r.lines,
          Assigned: r.assigned,
          Collected: r.collected,
          Outstanding: r.outstanding,
        })),
        "fee-group-report",
      );
    }
  };

  const hasRows =
    cfg.kind === "collection"
      ? (collection.data?.rows.length ?? 0) > 0
      : (feeGroup.data?.rows.length ?? 0) > 0;

  const label = useMemo(() => {
    if (cfg.value === "daily") return "Date";
    if (cfg.value === "monthly") return "Month";
    if (cfg.value === "classwise") return "Class";
    return "Fee Group";
  }, [cfg.value]);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl p-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="space-y-1.5">
            <Label>Report</Label>
            <Select value={report} onValueChange={setReport}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORTS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {cfg.kind === "collection" && (
            <>
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={exportCsv} disabled={!hasRows}>
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      </Card>

      <Card className="rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={4} />
          </div>
        ) : !hasRows ? (
          <EmptyState
            icon={BarChart3}
            title="Nothing to report"
            hint="No data for this report and range."
          />
        ) : cfg.kind === "collection" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">{label}</th>
                  <th className="px-3 py-2 font-medium text-right">Receipts</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {collection.data!.rows.map((r) => (
                  <tr key={r.key} className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{r.label}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{r.count}</td>
                    <td className="px-3 py-2 text-right font-medium">{inr(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/20 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{collection.data!.count}</td>
                  <td className="px-3 py-2 text-right">{inr(collection.data!.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Fee Group</th>
                  <th className="px-3 py-2 font-medium text-right">Lines</th>
                  <th className="px-3 py-2 font-medium text-right">Assigned</th>
                  <th className="px-3 py-2 font-medium text-right">Collected</th>
                  <th className="px-3 py-2 font-medium text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {feeGroup.data!.rows.map((r) => (
                  <tr key={r.groupId ?? r.groupName} className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{r.groupName}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{r.lines}</td>
                    <td className="px-3 py-2 text-right">{inr(r.assigned)}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">{inr(r.collected)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{inr(r.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/20 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right">{inr(feeGroup.data!.totals.assigned)}</td>
                  <td className="px-3 py-2 text-right">{inr(feeGroup.data!.totals.collected)}</td>
                  <td className="px-3 py-2 text-right">{inr(feeGroup.data!.totals.outstanding)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

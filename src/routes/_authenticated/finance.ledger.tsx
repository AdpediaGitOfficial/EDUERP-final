import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fmtDate, money } from "@/lib/module-util";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/finance/ledger")({ component: Page });

type Row = { date: string; kind: "income" | "expense"; desc: string; amount: number };

function Page() {
  const { data: entries } = useQuery({
    queryKey: ["finance-ledger"],
    queryFn: async () =>
      apiGet<
        { id: string; kind: "credit" | "debit"; amount: number; date: string; label: string }[]
      >("/finance/ledger?limit=1000"),
  });

  const rows: Row[] = useMemo(() => {
    return (entries ?? [])
      .map((e) => ({
        date: e.date ?? "",
        kind: (e.kind === "credit" ? "income" : "expense") as Row["kind"],
        desc: e.label,
        amount: Number(e.amount || 0),
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [entries]);

  const income = rows.filter((r) => r.kind === "income").reduce((a, r) => a + r.amount, 0);
  const expTotal = rows.filter((r) => r.kind === "expense").reduce((a, r) => a + r.amount, 0);

  const exportCsv = () => {
    const header = "Date,Kind,Description,Amount\n";
    const body = rows
      .map((r) => `${r.date},${r.kind},"${r.desc.replace(/"/g, "'")}",${r.amount}`)
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ledger.csv";
    a.click();
  };

  return (
    <>
      <PageHeader
        title="Ledger"
        subtitle="Combined income and expenses."
        action={
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4 mr-1" /> Export CSV
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Income</div>
          <div className="text-2xl font-semibold text-emerald-600">{money(income)}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Expenses</div>
          <div className="text-2xl font-semibold text-red-600">{money(expTotal)}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Net</div>
          <div className="text-2xl font-semibold">{money(income - expTotal)}</div>
        </Card>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Date</th>
              <th className="p-3">Kind</th>
              <th className="p-3">Description</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-3">{fmtDate(r.date)}</td>
                <td className="p-3 capitalize">{r.kind}</td>
                <td className="p-3">{r.desc}</td>
                <td
                  className={`p-3 text-right font-medium ${r.kind === "income" ? "text-emerald-600" : "text-red-600"}`}
                >
                  {r.kind === "income" ? "+" : "-"}
                  {money(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

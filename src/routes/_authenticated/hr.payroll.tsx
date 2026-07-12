import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { badgeClass, fmtDate, money, niceLabel } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/hr/payroll")({ component: Page });

function Page() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["hr-payroll-all"],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/hr/payroll-runs?pageSize=200");
      return res.rows.map((p) => ({
        id: p.id,
        net_salary: p.netSalary,
        status: p.status,
        month: p.month,
        pay_date: p.payDate,
        staff: {
          full_name: p.staffName,
          employee_code: p.employeeCode,
          designation: p.designation,
        },
      }));
    },
  });
  const summary = { total: 0, paid: 0, pending: 0 };
  for (const p of data ?? []) {
    summary.total += Number((p as any).net_salary || 0);
    if ((p as any).status === "paid") summary.paid += Number((p as any).net_salary || 0);
    else summary.pending += Number((p as any).net_salary || 0);
  }
  return (
    <>
      <PageHeader title="Payroll" subtitle="Monthly payroll history across all staff." />
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-2xl font-semibold">{money(summary.total)}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Paid</div>
          <div className="text-2xl font-semibold text-emerald-600">{money(summary.paid)}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="text-2xl font-semibold text-amber-600">{money(summary.pending)}</div>
        </Card>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Employee</th>
                <th className="p-3">Designation</th>
                <th className="p-3">Month</th>
                <th className="p-3">Net</th>
                <th className="p-3">Status</th>
                <th className="p-3">Pay date</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{p.staff?.full_name}</div>
                    <div className="text-xs text-muted-foreground">{p.staff?.employee_code}</div>
                  </td>
                  <td className="p-3">{p.staff?.designation}</td>
                  <td className="p-3">{fmtDate(p.month)}</td>
                  <td className="p-3 font-medium">{money(p.net_salary)}</td>
                  <td className="p-3">
                    <Badge className={badgeClass(p.status)}>{niceLabel(p.status)}</Badge>
                  </td>
                  <td className="p-3">{fmtDate(p.pay_date)}</td>
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

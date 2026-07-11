import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { badgeClass, fmtDate, money, niceLabel } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/ess/payslips")({ component: Page });

function Page() {
  const { user } = useCurrentUser();
  const { data: staff } = useQuery({
    queryKey: ["me-s", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("staff").select("id").eq("profile_id", user!.id).maybeSingle()).data,
  });
  const { data } = useQuery({
    queryKey: ["me-payslips", staff?.id],
    enabled: !!staff,
    queryFn: async () =>
      (
        await supabase
          .from("payroll_runs")
          .select("*")
          .eq("staff_id", staff!.id)
          .order("month", { ascending: false })
      ).data ?? [],
  });
  return (
    <>
      <PageHeader title="My Payslips" subtitle="Monthly salary history and downloads." />
      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Month</th>
              <th className="p-3">Base</th>
              <th className="p-3">Allowances</th>
              <th className="p-3">Deductions</th>
              <th className="p-3">Net</th>
              <th className="p-3">Status</th>
              <th className="p-3">Payslip</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p: any) => (
              <tr key={p.id} className="border-t">
                <td className="p-3">{fmtDate(p.month)}</td>
                <td className="p-3">{money(p.base_salary)}</td>
                <td className="p-3">{money(p.allowances)}</td>
                <td className="p-3">{money(p.deductions)}</td>
                <td className="p-3 font-medium">{money(p.net_salary)}</td>
                <td className="p-3">
                  <Badge className={badgeClass(p.status)}>{niceLabel(p.status)}</Badge>
                </td>
                <td className="p-3">
                  <button
                    className="text-primary text-xs hover:underline"
                    onClick={() => window.print()}
                  >
                    Download
                  </button>
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <EmptyRow
                colSpan={7}
                title="No payslips yet"
                hint="Your monthly payslips will appear here."
              />
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

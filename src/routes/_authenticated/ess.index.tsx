import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/ess/")({ component: Page });

function Page() {
  const { user } = useCurrentUser();
  const { data: staff } = useQuery({
    queryKey: ["me-staff", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("staff").select("*").eq("profile_id", user!.id).maybeSingle()).data,
  });
  const { data: leaves } = useQuery({
    queryKey: ["me-leaves", staff?.id],
    enabled: !!staff,
    queryFn: async () =>
      (await supabase.from("leave_requests").select("id, status").eq("staff_id", staff!.id)).data ??
      [],
  });
  const { data: payroll } = useQuery({
    queryKey: ["me-payroll", staff?.id],
    enabled: !!staff,
    queryFn: async () =>
      (
        await supabase
          .from("payroll_runs")
          .select("net_salary, status, month")
          .eq("staff_id", staff!.id)
          .order("month", { ascending: false })
          .limit(3)
      ).data ?? [],
  });

  if (!user) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  if (!staff)
    return (
      <>
        <PageHeader title={`Welcome, ${user.fullName}`} subtitle="Employee Self-Service" />
        <Card className="p-8 rounded-2xl text-center text-muted-foreground">
          Your employee record is not linked yet. Contact HR to complete setup.
        </Card>
      </>
    );
  const pending = (leaves ?? []).filter((l: any) => l.status === "pending").length;
  const lastNet = payroll?.[0]?.net_salary;
  return (
    <>
      <PageHeader
        title={`Welcome, ${staff.full_name}`}
        subtitle={`${staff.designation} · ${staff.department} · ${staff.employee_code}`}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Employee ID</div>
          <div className="font-semibold">{staff.employee_code}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Status</div>
          <div className="font-semibold capitalize">{staff.status}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Last payslip</div>
          <div className="font-semibold">{lastNet ? money(lastNet) : "—"}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Leave requests pending</div>
          <div className="font-semibold text-amber-600">{pending}</div>
        </Card>
      </div>
    </>
  );
}

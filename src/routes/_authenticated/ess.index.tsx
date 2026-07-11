import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { money } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/ess/")({ component: Page });

type Summary = {
  staff: {
    id: string;
    employee_code: string;
    full_name: string;
    designation: string;
    department: string;
    status: string;
  } | null;
  pendingLeaves?: number;
  lastNet?: number | null;
};

function Page() {
  const { user } = useCurrentUser();
  const { data } = useQuery({
    queryKey: ["ess-summary"],
    queryFn: () => apiGet<Summary>("/ess/summary"),
  });
  const staff = data?.staff;

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
  const pending = data?.pendingLeaves ?? 0;
  const lastNet = data?.lastNet;
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

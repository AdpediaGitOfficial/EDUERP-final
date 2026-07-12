import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/status-badge";
import { money } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/hr/settings")({ component: Page });

type EmploymentType = { id: string; name: string; code: string };
type PayGrade = {
  id: string;
  name: string;
  code: string;
  level: number;
  min_salary: string | null;
  max_salary: string | null;
};
type LeaveType = {
  id: string;
  name: string;
  code: string;
  annual_quota: number;
  is_paid: boolean;
  carry_forward: boolean;
};

function Page() {
  const { data: employmentTypes } = useQuery({
    queryKey: ["hr-employment-types"],
    queryFn: () => apiGet<EmploymentType[]>("/hr/employment-types"),
  });
  const { data: payGrades } = useQuery({
    queryKey: ["hr-pay-grades"],
    queryFn: () => apiGet<PayGrade[]>("/hr/pay-grades"),
  });
  const { data: leaveTypes } = useQuery({
    queryKey: ["hr-leave-types"],
    queryFn: () => apiGet<LeaveType[]>("/hr/leave-types"),
  });

  return (
    <>
      <PageHeader
        title="HR Settings"
        subtitle="Organisation master data, attendance, leave and payroll rules."
      />

      {/* Organisation masters — governed reference data */}
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-5 rounded-2xl">
          <h3 className="font-semibold mb-3">Employment types</h3>
          <div className="flex flex-wrap gap-1.5">
            {(employmentTypes ?? []).map((t) => (
              <StatusBadge key={t.id} tone="info" label={t.name} />
            ))}
            {(employmentTypes ?? []).length === 0 && (
              <span className="text-sm text-muted-foreground">None configured.</span>
            )}
          </div>
        </Card>

        <Card className="p-5 rounded-2xl">
          <h3 className="font-semibold mb-3">Pay grades</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-1">Grade</th>
                  <th className="py-1">Level</th>
                  <th className="py-1 text-right">Range</th>
                </tr>
              </thead>
              <tbody>
                {(payGrades ?? []).map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="py-1.5">
                      {g.name} <span className="text-muted-foreground">({g.code})</span>
                    </td>
                    <td className="py-1.5">{g.level}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {money(Number(g.min_salary ?? 0))} – {money(Number(g.max_salary ?? 0))}
                    </td>
                  </tr>
                ))}
                {(payGrades ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-3 text-muted-foreground">
                      None configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5 rounded-2xl">
          <h3 className="font-semibold mb-3">Leave types</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-1">Type</th>
                  <th className="py-1">Quota</th>
                  <th className="py-1">Flags</th>
                </tr>
              </thead>
              <tbody>
                {(leaveTypes ?? []).map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="py-1.5">{l.name}</td>
                    <td className="py-1.5">{l.annual_quota || "—"}</td>
                    <td className="py-1.5">
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge
                          tone={l.is_paid ? "success" : "neutral"}
                          label={l.is_paid ? "Paid" : "Unpaid"}
                        />
                        {l.carry_forward && <StatusBadge tone="info" label="Carry fwd" />}
                      </div>
                    </td>
                  </tr>
                ))}
                {(leaveTypes ?? []).length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-3 text-muted-foreground">
                      None configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-5 rounded-2xl">
          <h3 className="font-semibold mb-3">Attendance rules</h3>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 items-center">
              <Label>Working days / week</Label>
              <Input defaultValue="6" />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <Label>Late after (mins)</Label>
              <Input defaultValue="15" />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <Label>Half-day threshold</Label>
              <Input defaultValue="4h" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable biometric capture</Label>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable geo-fence check-in</Label>
              <Switch />
            </div>
          </div>
        </Card>
        <Card className="p-5 rounded-2xl">
          <h3 className="font-semibold mb-3">Payroll rules</h3>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 items-center">
              <Label>PF %</Label>
              <Input defaultValue="12" />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <Label>ESI %</Label>
              <Input defaultValue="0.75" />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <Label>Prof. tax</Label>
              <Input defaultValue="200" />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <Label>Payment cycle</Label>
              <Input defaultValue="Monthly" />
            </div>
          </div>
        </Card>
        <Card className="p-5 rounded-2xl">
          <h3 className="font-semibold mb-3">Approvals & notifications</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <Label>Leave requires manager + HR</Label>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label>Expense email notification</Label>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label>Payroll auto-generate payslips</Label>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <Label>Document expiry alerts (30-day)</Label>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        Organisation masters above are live from the database. The rule toggles are demo controls;
        persistent rule storage is out of scope for this build.
      </p>
    </>
  );
}

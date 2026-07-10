import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/hr/settings")({ component: Page });

function Page() {
  return (
    <>
      <PageHeader title="HR Settings" subtitle="Attendance, leave and payroll rules." />
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
          <h3 className="font-semibold mb-3">Leave rules</h3>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2 items-center">
              <Label>Annual leave (days)</Label>
              <Input defaultValue="15" />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <Label>Sick leave (days)</Label>
              <Input defaultValue="10" />
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <Label>Casual leave (days)</Label>
              <Input defaultValue="8" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Auto-accrual monthly</Label>
              <Switch defaultChecked />
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
        These settings are demo controls. Persistent settings storage is out of scope for this
        build.
      </p>
    </>
  );
}

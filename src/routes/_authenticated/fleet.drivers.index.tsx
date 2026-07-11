import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { badgeClass, daysUntil, fmtDate } from "@/lib/module-util";
import { Plus, Pencil, ChevronRight } from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fleet/drivers/")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [q, setQ] = useState("");

  const { data } = useQuery({
    queryKey: ["fleet-drivers-list"],
    queryFn: async () => {
      const rows = await apiGet<any[]>("/fleet/drivers");
      return rows.map((d) => ({
        id: d.id,
        full_name: d.fullName,
        license_no: d.licenseNo,
        license_expiry: d.licenseExpiry,
        phone: d.phone,
        years_experience: d.yearsExperience,
        assigned_vehicle_id: d.assignedVehicleId,
        fleet_vehicles: d.vehicleReg ? { registration_no: d.vehicleReg } : null,
      }));
    },
  });

  const filtered = (data ?? []).filter(
    (d: any) =>
      !q ||
      d.full_name?.toLowerCase().includes(q.toLowerCase()) ||
      d.license_no?.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        title="Drivers"
        subtitle="Drivers, licenses and vehicle assignment."
        action={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Add Driver
          </Button>
        }
      />
      <Input
        placeholder="Search name or license"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-3 max-w-xs"
      />
      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Name</th>
                <th className="p-3">License</th>
                <th className="p-3">Expiry</th>
                <th className="p-3">Phone</th>
                <th className="p-3">Experience</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d: any) => {
                const days = daysUntil(d.license_expiry);
                return (
                  <tr
                    key={d.id}
                    className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() =>
                      nav({ to: "/fleet/drivers/$driverId", params: { driverId: d.id } })
                    }
                  >
                    <td className="p-3 font-medium">{d.full_name}</td>
                    <td className="p-3 font-mono text-xs">{d.license_no}</td>
                    <td className="p-3 whitespace-nowrap">
                      {fmtDate(d.license_expiry)}{" "}
                      {days !== null && days <= 60 && (
                        <Badge className={badgeClass("pending")}>{days}d</Badge>
                      )}
                    </td>
                    <td className="p-3">{d.phone ?? "—"}</td>
                    <td className="p-3">{d.years_experience} yrs</td>
                    <td className="p-3 font-mono text-xs">
                      {d.fleet_vehicles?.registration_no ?? "—"}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(d);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <ChevronRight className="inline size-4 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td className="p-6 text-center text-muted-foreground" colSpan={7}>
                    No drivers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <DriverDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onDone={() => qc.invalidateQueries({ queryKey: ["fleet-drivers-list"] })}
      />
    </>
  );
}

export function DriverDialog({
  open,
  onOpenChange,
  editing,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any | null;
  onDone: () => void;
}) {
  const [form, setForm] = useState<any>(() => editing ?? { years_experience: 0 });
  useEffect(() => {
    if (open) setForm(editing ?? { years_experience: 0 });
  }, [open, editing]);

  const { data: vehicles } = useQuery({
    queryKey: ["driver-veh-picker"],
    queryFn: async () => {
      const rows = await apiGet<any[]>("/fleet/vehicles");
      return rows.map((v) => ({ id: v.id, registration_no: v.registrationNo }));
    },
    enabled: open,
  });

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        fullName: form.full_name,
        licenseNo: form.license_no,
        licenseExpiry: form.license_expiry || undefined,
        phone: form.phone || undefined,
        yearsExperience: Number(form.years_experience || 0),
        assignedVehicleId:
          form.assigned_vehicle_id === "__none" ? undefined : form.assigned_vehicle_id || undefined,
      };
      await apiFetch(editing ? `/fleet/drivers/${editing.id}` : "/fleet/drivers", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Driver updated" : "Driver added");
      onDone();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Driver" : "Add Driver"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name">
            <Input
              value={form.full_name ?? ""}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </Field>
          <Field label="License No">
            <Input
              value={form.license_no ?? ""}
              onChange={(e) => setForm({ ...form, license_no: e.target.value })}
            />
          </Field>
          <Field label="License Expiry">
            <Input
              type="date"
              value={form.license_expiry ?? ""}
              onChange={(e) => setForm({ ...form, license_expiry: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Experience (years)">
            <Input
              type="number"
              value={form.years_experience ?? 0}
              onChange={(e) => setForm({ ...form, years_experience: e.target.value })}
            />
          </Field>
          <Field label="Assigned Vehicle">
            <Select
              value={form.assigned_vehicle_id ?? "__none"}
              onValueChange={(v) => setForm({ ...form, assigned_vehicle_id: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {(vehicles ?? []).map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.registration_no}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.full_name || !form.license_no}
          >
            {mut.isPending ? "Saving…" : editing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

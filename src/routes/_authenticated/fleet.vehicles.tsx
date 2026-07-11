import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { badgeClass, daysUntil, fmtDate, niceLabel } from "@/lib/module-util";
import { Plus, Pencil, ChevronRight } from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fleet/vehicles")({ component: Page });

type Vehicle = any;

function Page() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  const { data } = useQuery({
    queryKey: ["fleet-vehicles-list"],
    queryFn: async () => {
      const rows = await apiGet<any[]>("/fleet/vehicles");
      return rows.map((v) => ({
        id: v.id,
        registration_no: v.registrationNo,
        vehicle_type: v.vehicleType,
        model: v.model,
        capacity: v.capacity,
        purchase_date: v.purchaseDate,
        insurance_expiry: v.insuranceExpiry,
        permit_expiry: v.permitExpiry,
        status: v.status,
        drivers: v.driver ? [{ id: v.driver.id, full_name: v.driver.fullName }] : [],
        transport_routes: v.route ? [{ id: v.route.id, name: v.route.name }] : [],
      }));
    },
  });

  const filtered = (data ?? []).filter((v: any) => {
    if (statusF !== "all" && v.status !== statusF) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return v.registration_no?.toLowerCase().includes(s) || v.model?.toLowerCase().includes(s);
  });

  const openAdd = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Vehicles"
        subtitle="Registered vehicles, expiry alerts, and assignments."
        action={
          <Button size="sm" onClick={openAdd}>
            <Plus className="size-4" /> Add Vehicle
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          placeholder="Search reg. no. or model"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Registration</th>
                <th className="p-3">Type</th>
                <th className="p-3">Model</th>
                <th className="p-3">Capacity</th>
                <th className="p-3">Driver</th>
                <th className="p-3">Route</th>
                <th className="p-3">Insurance</th>
                <th className="p-3">Permit</th>
                <th className="p-3">Status</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v: any) => {
                const ins = daysUntil(v.insurance_expiry);
                const per = daysUntil(v.permit_expiry);
                return (
                  <tr
                    key={v.id}
                    className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() =>
                      nav({ to: "/fleet/vehicles/$vehicleId", params: { vehicleId: v.id } })
                    }
                  >
                    <td className="p-3 font-mono text-xs">{v.registration_no}</td>
                    <td className="p-3 capitalize">{v.vehicle_type}</td>
                    <td className="p-3">{v.model ?? "—"}</td>
                    <td className="p-3">{v.capacity}</td>
                    <td className="p-3">{v.drivers?.[0]?.full_name ?? "—"}</td>
                    <td className="p-3">{v.transport_routes?.[0]?.name ?? "—"}</td>
                    <td className="p-3 whitespace-nowrap">
                      {fmtDate(v.insurance_expiry)}{" "}
                      {ins !== null && ins <= 30 && (
                        <Badge className={badgeClass("pending")}>Due</Badge>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {fmtDate(v.permit_expiry)}{" "}
                      {per !== null && per <= 30 && (
                        <Badge className={badgeClass("pending")}>Due</Badge>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge className={badgeClass(v.status)}>{niceLabel(v.status)}</Badge>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(v);
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
                  <td className="p-6 text-center text-muted-foreground" colSpan={10}>
                    No vehicles found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <VehicleDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onDone={() => qc.invalidateQueries({ queryKey: ["fleet-vehicles-list"] })}
      />
    </>
  );
}

export function VehicleDialog({
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
  const [form, setForm] = useState<any>(
    () => editing ?? { vehicle_type: "bus", capacity: 40, status: "active" },
  );
  useEffect(() => {
    if (open) setForm(editing ?? { vehicle_type: "bus", capacity: 40, status: "active" });
  }, [open, editing]);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        registrationNo: form.registration_no,
        vehicleType: form.vehicle_type,
        model: form.model || undefined,
        capacity: Number(form.capacity),
        purchaseDate: form.purchase_date || undefined,
        insuranceExpiry: form.insurance_expiry || undefined,
        permitExpiry: form.permit_expiry || undefined,
        status: form.status,
      };
      await apiFetch(editing ? `/fleet/vehicles/${editing.id}` : "/fleet/vehicles", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(editing ? "Vehicle updated" : "Vehicle added");
      onDone();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Registration No">
            <Input
              value={form.registration_no ?? ""}
              onChange={(e) => setForm({ ...form, registration_no: e.target.value })}
              placeholder="MH-12-AB-1234"
            />
          </Field>
          <Field label="Type">
            <Select
              value={form.vehicle_type}
              onValueChange={(v) => setForm({ ...form, vehicle_type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bus">Bus</SelectItem>
                <SelectItem value="van">Van</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Model">
            <Input
              value={form.model ?? ""}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
            />
          </Field>
          <Field label="Capacity">
            <Input
              type="number"
              value={form.capacity ?? 40}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
          </Field>
          <Field label="Purchase Date">
            <Input
              type="date"
              value={form.purchase_date ?? ""}
              onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
            />
          </Field>
          <Field label="Insurance Expiry">
            <Input
              type="date"
              value={form.insurance_expiry ?? ""}
              onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })}
            />
          </Field>
          <Field label="Permit Expiry">
            <Input
              type="date"
              value={form.permit_expiry ?? ""}
              onChange={(e) => setForm({ ...form, permit_expiry: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.registration_no}>
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

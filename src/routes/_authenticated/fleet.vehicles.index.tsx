import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { DataTable, type Column } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
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
import { daysUntil, fmtDate } from "@/lib/module-util";
import { Plus, Pencil, ChevronRight } from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fleet/vehicles/")({ component: Page });

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

  const expiryCell = (date: string | null) => {
    const d = daysUntil(date);
    return (
      <span className="whitespace-nowrap">
        {fmtDate(date)} {d !== null && d <= 30 && <StatusBadge status="pending" label="Due" />}
      </span>
    );
  };

  const columns: Column<any>[] = [
    {
      id: "registration_no",
      header: "Registration",
      sortValue: (v) => v.registration_no ?? "",
      cell: (v) => <span className="font-mono text-xs">{v.registration_no}</span>,
    },
    {
      id: "vehicle_type",
      header: "Type",
      sortValue: (v) => v.vehicle_type ?? "",
      cell: (v) => <span className="capitalize">{v.vehicle_type}</span>,
    },
    { id: "model", header: "Model", cell: (v) => v.model ?? "—" },
    {
      id: "capacity",
      header: "Capacity",
      align: "right",
      sortValue: (v) => Number(v.capacity) || 0,
      cell: (v) => v.capacity,
    },
    { id: "driver", header: "Driver", cell: (v) => v.drivers?.[0]?.full_name ?? "—" },
    { id: "route", header: "Route", cell: (v) => v.transport_routes?.[0]?.name ?? "—" },
    { id: "insurance", header: "Insurance", cell: (v) => expiryCell(v.insurance_expiry) },
    { id: "permit", header: "Permit", cell: (v) => expiryCell(v.permit_expiry) },
    {
      id: "status",
      header: "Status",
      sortValue: (v) => v.status ?? "",
      cell: (v) => <StatusBadge status={v.status} />,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (v) => (
        <span className="whitespace-nowrap" data-no-nav onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => openEdit(v)} aria-label="Edit vehicle">
            <Pencil className="size-3.5" />
          </Button>
          <ChevronRight className="inline size-4 text-muted-foreground" />
        </span>
      ),
    },
  ];

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

      <DataTable
        rows={data === undefined ? undefined : filtered}
        columns={columns}
        getRowId={(v) => v.id}
        loading={data === undefined}
        onRowClick={(v) => nav({ to: "/fleet/vehicles/$vehicleId", params: { vehicleId: v.id } })}
        initialSort={{ id: "registration_no", dir: "asc" }}
        emptyTitle="No vehicles found"
        emptyHint="Add a vehicle to start building your fleet."
      />

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

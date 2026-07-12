import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { badgeClass, daysUntil, fmtDate, niceLabel } from "@/lib/module-util";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { DriverDialog } from "./fleet.drivers.index";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fleet/drivers/$driverId")({
  component: Page,
});

function Page() {
  const { driverId } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const [incOpen, setIncOpen] = useState(false);

  const { data: d, isLoading } = useQuery({
    queryKey: ["driver-detail", driverId],
    queryFn: () =>
      apiGet<{
        id: string;
        full_name: string;
        license_no: string;
        license_expiry: string | null;
        phone: string | null;
        years_experience: number;
        assigned_vehicle_id: string | null;
        vehicle: { id: string; registration_no: string } | null;
      }>(`/fleet/drivers/${driverId}`),
  });
  const { data: incidents } = useQuery({
    queryKey: ["driver-incidents", driverId],
    queryFn: () =>
      apiGet<
        {
          id: string;
          incident_date: string | null;
          incident_type: string;
          severity: string;
          description: string;
          status: string;
        }[]
      >(`/fleet/drivers/${driverId}/incidents`),
  });

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (!d) return <div className="p-6">Driver not found.</div>;

  const days = daysUntil(d.license_expiry);
  const veh = d.vehicle;
  const openCount = (incidents ?? []).filter((i) => i.status === "open").length;

  return (
    <>
      <div className="mb-3">
        <Button variant="ghost" size="sm" onClick={() => nav({ to: "/fleet/drivers" })}>
          <ArrowLeft className="size-4" /> Back to drivers
        </Button>
      </div>
      <PageHeader
        title={d.full_name}
        subtitle={d.license_no}
        action={
          <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Phone">{d.phone ?? "—"}</Stat>
        <Stat label="Experience">{d.years_experience} yrs</Stat>
        <Stat label="License expires">
          {fmtDate(d.license_expiry)}{" "}
          {days !== null && days <= 60 && <StatusBadge status="pending" label={`${days}d`} />}
        </Stat>
        <Stat label="Current vehicle">
          {veh ? <span className="font-mono text-xs">{veh.registration_no}</span> : "—"}
        </Stat>
      </div>

      <Tabs defaultValue="incidents">
        <TabsList>
          <TabsTrigger value="incidents">
            Incidents{" "}
            {openCount > 0 && (
              <Badge className="ml-2 bg-red-100 text-red-800 border-0">{openCount} open</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="incidents">
          <div className="mb-2 flex justify-end">
            <Button size="sm" onClick={() => setIncOpen(true)}>
              <Plus className="size-4" /> Log incident
            </Button>
          </div>
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Date</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Severity</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(incidents ?? []).map((i: any) => (
                    <tr key={i.id} className="border-t">
                      <td className="p-3">{fmtDate(i.incident_date)}</td>
                      <td className="p-3">{niceLabel(i.incident_type)}</td>
                      <td className="p-3">
                        <Badge
                          className={
                            i.severity === "high"
                              ? "bg-red-100 text-red-800 border-0"
                              : i.severity === "medium"
                                ? "bg-amber-100 text-amber-800 border-0"
                                : "bg-slate-100 text-slate-700 border-0"
                          }
                        >
                          {niceLabel(i.severity)}
                        </Badge>
                      </td>
                      <td className="p-3 max-w-md truncate">{i.description}</td>
                      <td className="p-3">
                        <Badge
                          className={
                            i.status === "open"
                              ? "bg-amber-100 text-amber-800 border-0"
                              : i.status === "resolved"
                                ? "bg-emerald-100 text-emerald-800 border-0"
                                : "bg-slate-100 text-slate-700 border-0"
                          }
                        >
                          {niceLabel(i.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {(incidents ?? []).length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                        No incidents logged.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="documents">
          <Card className="p-6 rounded-2xl text-sm text-muted-foreground">
            License number and expiry are captured on the driver profile above. File upload for a
            scanned license image is coming — the expiry date drives the renewals alerts today.
          </Card>
        </TabsContent>
      </Tabs>

      <DriverDialog
        open={edit}
        onOpenChange={setEdit}
        editing={d}
        onDone={() => qc.invalidateQueries({ queryKey: ["driver-detail", driverId] })}
      />
      <IncidentDialog
        open={incOpen}
        onOpenChange={setIncOpen}
        driverId={driverId}
        onDone={() => qc.invalidateQueries({ queryKey: ["driver-incidents", driverId] })}
      />
    </>
  );
}

function IncidentDialog({
  open,
  onOpenChange,
  driverId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driverId: string;
  onDone: () => void;
}) {
  const [form, setForm] = useState<any>({
    incident_type: "traffic_violation",
    severity: "low",
    status: "open",
    incident_date: new Date().toISOString().slice(0, 10),
  });
  const mut = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/fleet/drivers/${driverId}/incidents`, {
        method: "POST",
        body: JSON.stringify({
          incidentType: form.incident_type,
          severity: form.severity,
          status: form.status,
          incidentDate: form.incident_date,
          description: form.description,
        }),
      });
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message ?? "Save failed");
      }
    },
    onSuccess: () => {
      toast.success("Incident logged");
      onDone();
      onOpenChange(false);
      setForm({
        incident_type: "traffic_violation",
        severity: "low",
        status: "open",
        incident_date: new Date().toISOString().slice(0, 10),
      });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log incident</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={form.incident_date}
              onChange={(e) => setForm({ ...form, incident_date: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Type</Label>
            <Select
              value={form.incident_type}
              onValueChange={(v) => setForm({ ...form, incident_type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="traffic_violation">Traffic violation</SelectItem>
                <SelectItem value="accident">Accident</SelectItem>
                <SelectItem value="complaint">Complaint</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Severity</Label>
            <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={3}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.description}>
            {mut.isPending ? "Saving…" : "Log incident"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, children }: { label: string; children: any }) {
  return (
    <Card className="p-3 rounded-xl min-w-0 overflow-hidden">
      <div className="text-xs text-muted-foreground truncate">{label}</div>
      <div className="mt-1 text-sm font-medium break-words">{children}</div>
    </Card>
  );
}

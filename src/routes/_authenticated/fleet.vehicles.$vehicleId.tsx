import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch, apiPost, apiFileObjectUrl } from "@/lib/api/client";
import { useConfirm } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileUpload } from "@/components/file-upload";
import { useCurrentUser } from "@/hooks/use-current-user";
import { daysUntil, fmtDate, money, niceLabel } from "@/lib/module-util";
import { ArrowLeft, Pencil, Power } from "lucide-react";
import { useState } from "react";
import { VehicleDialog } from "./fleet.vehicles.index";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fleet/vehicles/$vehicleId")({
  component: Page,
});

function Page() {
  const { vehicleId } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const confirm = useConfirm();
  const { user } = useCurrentUser();
  const canManage = !!user?.roles.some((r) => r === "admin" || r === "fleet_manager");
  const [edit, setEdit] = useState(false);
  const [docKind, setDocKind] = useState("insurance");

  const openFile = async (url: string) => {
    const obj = await apiFileObjectUrl(url);
    if (obj) window.open(obj, "_blank", "noopener");
  };

  const { data: v, isLoading } = useQuery({
    queryKey: ["vehicle-detail", vehicleId],
    queryFn: () =>
      apiGet<{
        id: string;
        registration_no: string;
        vehicle_type: string;
        model: string | null;
        capacity: number;
        status: string;
        purchase_date: string | null;
        insurance_expiry: string | null;
        permit_expiry: string | null;
        driver: { id: string; full_name: string } | null;
        route: { id: string; name: string; stops: number } | null;
      }>(`/fleet/vehicles/${vehicleId}`),
  });
  const { data: fuel } = useQuery({
    queryKey: ["vehicle-fuel", vehicleId],
    queryFn: () =>
      apiGet<
        { id: string; date: string | null; liters: number; cost: number; odometer: number | null }[]
      >(`/fleet/vehicles/${vehicleId}/fuel`),
  });
  const { data: maint } = useQuery({
    queryKey: ["vehicle-maint", vehicleId],
    queryFn: () =>
      apiGet<
        {
          id: string;
          service_date: string | null;
          service_type: string;
          vendor: string | null;
          cost: number;
          next_due_date: string | null;
        }[]
      >(`/fleet/vehicles/${vehicleId}/maintenance`),
  });
  const { data: docs } = useQuery({
    queryKey: ["vehicle-docs", vehicleId],
    queryFn: () =>
      apiGet<
        {
          id: string;
          title: string;
          doc_kind: string;
          issue_date: string | null;
          expiry_date: string | null;
        }[]
      >(`/fleet/vehicles/${vehicleId}/documents`),
  });

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (!v)
    return (
      <div className="p-6">
        Vehicle not found.{" "}
        <Link to="/fleet/vehicles" className="underline">
          Back
        </Link>
      </div>
    );

  const fuelTotal = (fuel ?? []).reduce((a: number, x: any) => a + Number(x.cost || 0), 0);
  const maintTotal = (maint ?? []).reduce((a: number, x: any) => a + Number(x.cost || 0), 0);
  const trips = (fuel ?? []).length;
  const ins = daysUntil(v.insurance_expiry);
  const per = daysUntil(v.permit_expiry);
  const route = v.route;
  const driver = v.driver;

  // Fuel efficiency computation: order asc by date, diff odometer/liters
  const eff = [...(fuel ?? [])].sort((a: any, b: any) => a.date.localeCompare(b.date));
  const effList: number[] = [];
  for (let i = 1; i < eff.length; i++) {
    const km = Number(eff[i].odometer) - Number(eff[i - 1].odometer);
    const l = Number(eff[i].liters);
    if (km > 0 && l > 0) effList.push(km / l);
  }
  const avgEff = effList.length ? effList.reduce((a, b) => a + b, 0) / effList.length : null;
  const last3 = effList.slice(-3);
  const prev3 = effList.slice(-6, -3);
  const declining =
    last3.length &&
    prev3.length &&
    last3.reduce((a, b) => a + b, 0) / last3.length <
      prev3.reduce((a, b) => a + b, 0) / prev3.length;

  const deactivate = async () => {
    if (
      !(await confirm({
        title: "Deactivate this vehicle?",
        description: `${v.registration_no} will be marked inactive and hidden from active-fleet views. You can reactivate it later by editing the vehicle.`,
        confirmText: "Deactivate",
        destructive: true,
      }))
    )
      return;
    const res = await apiFetch(`/fleet/vehicles/${v.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        registrationNo: v.registration_no,
        vehicleType: v.vehicle_type,
        model: v.model ?? undefined,
        capacity: v.capacity,
        purchaseDate: v.purchase_date ?? undefined,
        insuranceExpiry: v.insurance_expiry ?? undefined,
        permitExpiry: v.permit_expiry ?? undefined,
        status: "inactive",
      }),
    });
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      toast.error(body?.message ?? "Could not deactivate");
      return;
    }
    toast.success("Vehicle deactivated");
    qc.invalidateQueries({ queryKey: ["vehicle-detail", vehicleId] });
  };

  return (
    <>
      <div className="mb-3">
        <Button variant="ghost" size="sm" onClick={() => nav({ to: "/fleet/vehicles" })}>
          <ArrowLeft className="size-4" /> Back to vehicles
        </Button>
      </div>
      <PageHeader
        title={v.registration_no}
        subtitle={`${niceLabel(v.vehicle_type)} · ${v.model ?? "—"} · ${v.capacity} seats`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
            {v.status !== "inactive" && (
              <Button variant="outline" size="sm" onClick={deactivate}>
                <Power className="size-3.5" /> Deactivate
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Status">
          <StatusBadge status={v.status} />
        </Stat>
        <Stat label="Assigned driver">
          {driver ? (
            <Link
              to="/fleet/drivers/$driverId"
              params={{ driverId: driver.id }}
              className="underline"
            >
              {driver.full_name}
            </Link>
          ) : (
            "—"
          )}
        </Stat>
        <Stat label="Assigned route">
          {route ? (
            <Link to="/fleet/routes/$routeId" params={{ routeId: route.id }} className="underline">
              {route.name}
            </Link>
          ) : (
            "—"
          )}
        </Stat>
        <Stat label="Trips (fuel refills)">{trips}</Stat>
        <Stat label="Insurance">
          {fmtDate(v.insurance_expiry)}{" "}
          {ins !== null && ins <= 60 && <StatusBadge status="pending" label={`${ins}d`} />}
        </Stat>
        <Stat label="Permit">
          {fmtDate(v.permit_expiry)}{" "}
          {per !== null && per <= 60 && <StatusBadge status="pending" label={`${per}d`} />}
        </Stat>
        <Stat label="Fuel spend (all-time)">{money(fuelTotal)}</Stat>
        <Stat label="Maintenance (all-time)">{money(maintTotal)}</Stat>
      </div>

      {avgEff !== null && (
        <Card className="p-4 rounded-2xl mb-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Fuel efficiency (avg)</div>
            <div className="text-2xl font-semibold">{avgEff.toFixed(2)} km/L</div>
          </div>
          {declining && <StatusBadge tone="danger" label="Declining trend" />}
        </Card>
      )}

      <Tabs defaultValue="fuel">
        <TabsList>
          <TabsTrigger value="fuel">Fuel history</TabsTrigger>
          <TabsTrigger value="maint">Maintenance history</TabsTrigger>
          <TabsTrigger value="docs">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="fuel">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Date</th>
                    <th className="p-3">Liters</th>
                    <th className="p-3">Cost</th>
                    <th className="p-3">Odometer</th>
                  </tr>
                </thead>
                <tbody>
                  {(fuel ?? []).map((f: any) => (
                    <tr key={f.id} className="border-t">
                      <td className="p-3">{fmtDate(f.date)}</td>
                      <td className="p-3">{Number(f.liters).toFixed(1)} L</td>
                      <td className="p-3">{money(f.cost)}</td>
                      <td className="p-3">{f.odometer ?? "—"}</td>
                    </tr>
                  ))}
                  {(fuel ?? []).length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={4}>
                        No fuel entries.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="maint">
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Date</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Cost</th>
                    <th className="p-3">Next due</th>
                  </tr>
                </thead>
                <tbody>
                  {(maint ?? []).map((m: any) => {
                    const overdue = m.next_due_date && new Date(m.next_due_date) < new Date();
                    return (
                      <tr key={m.id} className="border-t">
                        <td className="p-3">{fmtDate(m.service_date)}</td>
                        <td className="p-3">{m.service_type}</td>
                        <td className="p-3">{m.vendor ?? "—"}</td>
                        <td className="p-3">{money(m.cost)}</td>
                        <td className="p-3">
                          {fmtDate(m.next_due_date)}{" "}
                          {overdue && <StatusBadge tone="danger" label="Overdue" />}
                        </td>
                      </tr>
                    );
                  })}
                  {(maint ?? []).length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                        No maintenance entries.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
        <TabsContent value="docs">
          {canManage && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Input
                value={docKind}
                onChange={(e) => setDocKind(e.target.value)}
                placeholder="Document kind (e.g. insurance, permit)"
                className="h-9 w-64"
                aria-label="Document kind"
              />
              <FileUpload
                category="vehicle-documents"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                label="Upload document"
                disabled={!docKind.trim()}
                onUploaded={async (meta) => {
                  await apiPost(`/fleet/vehicles/${vehicleId}/documents`, {
                    docKind: docKind.trim() || "document",
                    title: meta.name,
                    fileUrl: meta.url,
                  });
                  await qc.invalidateQueries({ queryKey: ["vehicle-docs", vehicleId] });
                }}
              />
            </div>
          )}
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Title</th>
                    <th className="p-3">Kind</th>
                    <th className="p-3">Issued</th>
                    <th className="p-3">Expires</th>
                    <th className="p-3">File</th>
                  </tr>
                </thead>
                <tbody>
                  {(docs ?? []).map((d: any) => (
                    <tr key={d.id} className="border-t">
                      <td className="p-3">{d.title}</td>
                      <td className="p-3 capitalize">{d.doc_kind}</td>
                      <td className="p-3">{fmtDate(d.issue_date)}</td>
                      <td className="p-3">{fmtDate(d.expiry_date)}</td>
                      <td className="p-3">
                        {d.file_url ? (
                          <Button variant="ghost" size="sm" onClick={() => openFile(d.file_url)}>
                            View
                          </Button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                  {(docs ?? []).length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={5}>
                        No documents on file. Upload insurance, permit, or fitness certificates
                        above; their expiry dates also drive the renewals alerts.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <VehicleDialog
        open={edit}
        onOpenChange={setEdit}
        editing={v}
        onDone={() => qc.invalidateQueries({ queryKey: ["vehicle-detail", vehicleId] })}
      />
    </>
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

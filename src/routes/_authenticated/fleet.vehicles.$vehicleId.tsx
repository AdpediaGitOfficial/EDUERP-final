import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { badgeClass, daysUntil, fmtDate, money, niceLabel } from "@/lib/module-util";
import { ArrowLeft, Pencil, Power } from "lucide-react";
import { useState } from "react";
import { VehicleDialog } from "./fleet.vehicles";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fleet/vehicles/$vehicleId")({
  component: Page,
});

function Page() {
  const { vehicleId } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);

  const { data: v, isLoading } = useQuery({
    queryKey: ["vehicle-detail", vehicleId],
    queryFn: async () =>
      (
        await supabase
          .from("fleet_vehicles")
          .select(
            "*, drivers!drivers_assigned_vehicle_id_fkey(id,full_name,phone,license_no), transport_routes!transport_routes_vehicle_id_fkey(id,name,route_stops(id))",
          )
          .eq("id", vehicleId)
          .maybeSingle()
      ).data,
  });
  const { data: fuel } = useQuery({
    queryKey: ["vehicle-fuel", vehicleId],
    queryFn: async () =>
      (
        await supabase
          .from("fuel_logs")
          .select("*")
          .eq("vehicle_id", vehicleId)
          .order("date", { ascending: false })
      ).data ?? [],
  });
  const { data: maint } = useQuery({
    queryKey: ["vehicle-maint", vehicleId],
    queryFn: async () =>
      (
        await supabase
          .from("vehicle_maintenance")
          .select("*")
          .eq("vehicle_id", vehicleId)
          .order("service_date", { ascending: false })
      ).data ?? [],
  });
  const { data: docs } = useQuery({
    queryKey: ["vehicle-docs", vehicleId],
    queryFn: async () =>
      (
        await supabase
          .from("vehicle_documents")
          .select("*")
          .eq("vehicle_id", vehicleId)
          .order("expiry_date", { ascending: true })
      ).data ?? [],
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
  const route = v.transport_routes?.[0];
  const driver = v.drivers?.[0];

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
    if (!confirm("Deactivate this vehicle?")) return;
    const { error } = await supabase
      .from("fleet_vehicles")
      .update({ status: "inactive" })
      .eq("id", v.id);
    if (error) {
      toast.error(error.message);
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
          <Badge className={badgeClass(v.status)}>{niceLabel(v.status)}</Badge>
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
          {ins !== null && ins <= 60 && <Badge className={badgeClass("pending")}>{ins}d</Badge>}
        </Stat>
        <Stat label="Permit">
          {fmtDate(v.permit_expiry)}{" "}
          {per !== null && per <= 60 && <Badge className={badgeClass("pending")}>{per}d</Badge>}
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
          {declining && <Badge className="bg-red-100 text-red-800 border-0">Declining trend</Badge>}
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
                          {overdue && (
                            <Badge className="bg-red-100 text-red-800 border-0">Overdue</Badge>
                          )}
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
          <Card className="rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Title</th>
                    <th className="p-3">Kind</th>
                    <th className="p-3">Issued</th>
                    <th className="p-3">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {(docs ?? []).map((d: any) => (
                    <tr key={d.id} className="border-t">
                      <td className="p-3">{d.title}</td>
                      <td className="p-3 capitalize">{d.doc_kind}</td>
                      <td className="p-3">{fmtDate(d.issue_date)}</td>
                      <td className="p-3">{fmtDate(d.expiry_date)}</td>
                    </tr>
                  ))}
                  {(docs ?? []).length === 0 && (
                    <tr>
                      <td className="p-6 text-center text-muted-foreground" colSpan={4}>
                        No documents on file. Document upload UI is coming — the insurance and
                        permit expiry dates on this vehicle drive the renewals alerts today.
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

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, MapPin, Clock, Radio } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import {
  simulatePosition,
  statusLabel,
  statusBadgeClass,
  type SimRoute,
  type SimStop,
} from "@/lib/fleet-simulation";

export const Route = createFileRoute("/_authenticated/fleet/tracking")({ component: Page });

function Page() {
  const { data: routes } = useQuery({
    queryKey: ["track-routes"],
    queryFn: () =>
      apiGet<
        {
          id: string;
          name: string;
          vehicle_id: string | null;
          driver_id: string | null;
          vehicle: { id: string; registration_no: string } | null;
          driver: { id: string; full_name: string } | null;
          stops: { id: string; name: string; sequence: number; estimated_minutes: number }[];
        }[]
      >("/fleet/routes-full"),
    refetchOnWindowFocus: false,
  });

  // Real GPS positions from vehicles with a tracking device (auto-refresh 5s).
  const { data: livePositions } = useQuery({
    queryKey: ["fleet-live-positions"],
    queryFn: () =>
      apiGet<
        {
          vehicleId: string;
          registrationNo: string | null;
          routeName: string | null;
          lat: number;
          lng: number;
          speedKph: number | null;
          status: "live" | "stale" | "offline";
          updatedAt: string;
        }[]
      >("/fleet/positions"),
    refetchInterval: 5000,
  });
  const liveCount = (livePositions ?? []).filter((p) => p.status === "live").length;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 4000);
    return () => clearInterval(id);
  }, []);

  const simRoutes: SimRoute[] = useMemo(
    () =>
      (routes ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        vehicle_id: r.vehicle_id,
        driver_id: r.driver_id,
        stops: ((r.stops as SimStop[]) ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          sequence: s.sequence,
          estimated_minutes: s.estimated_minutes ?? 0,
        })),
      })),
    [routes],
  );

  const samples = simRoutes.map((r) => ({
    route: r,
    sample: simulatePosition(r, now),
    vehicle: (routes ?? []).find((x: any) => x.id === r.id)?.vehicle,
    driver: (routes ?? []).find((x: any) => x.id === r.id)?.driver,
  }));
  const [selectedId, setSelectedId] = useState<string | "all">("all");
  const shown = selectedId === "all" ? samples : samples.filter((s) => s.route.id === selectedId);

  return (
    <>
      <PageHeader
        title="Live Tracking"
        subtitle={
          liveCount > 0
            ? `${liveCount} vehicle${liveCount === 1 ? "" : "s"} reporting live GPS · others simulated from schedule.`
            : "Simulated positions calculated from each route's schedule."
        }
        action={
          <Select value={selectedId} onValueChange={(v) => setSelectedId(v as any)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All routes</SelectItem>
              {simRoutes.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {(livePositions ?? []).length > 0 && (
        <Card className="mb-4 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <Radio className="size-4 text-emerald-600" />
            <span className="font-medium text-sm">Live GPS positions</span>
            <span className="text-xs text-muted-foreground">auto-refreshing every 5s</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Vehicle</th>
                  <th className="p-3 font-medium">Route</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Speed</th>
                  <th className="p-3 font-medium">Coordinates</th>
                  <th className="p-3 font-medium">Last fix</th>
                </tr>
              </thead>
              <tbody>
                {(livePositions ?? []).map((p) => (
                  <tr key={p.vehicleId} className="border-t">
                    <td className="p-3 font-medium">{p.registrationNo ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{p.routeName ?? "—"}</td>
                    <td className="p-3">
                      <Badge
                        className={
                          p.status === "live"
                            ? "bg-emerald-100 text-emerald-800"
                            : p.status === "stale"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-muted text-muted-foreground"
                        }
                      >
                        {p.status === "live" ? "LIVE" : p.status === "stale" ? "STALE" : "OFFLINE"}
                      </Badge>
                    </td>
                    <td className="p-3">{p.speedKph != null ? `${p.speedKph} km/h` : "—"}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
        <div>
          <div className="font-medium">
            Schematic below is schedule-based; the table above is real GPS.
          </div>
          <div className="text-xs">
            Vehicles with a tracking device report live positions to{" "}
            <code>POST /fleet/vehicles/:id/position</code>; the map schematic interpolates the rest
            from each route's scheduled stops (AM: 07:00–08:30, PM: 15:00–16:30 local).
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-4">
        <Card className="rounded-2xl overflow-hidden min-w-0">
          <div className="p-3 border-b font-medium">Fleet ({samples.length})</div>
          <ul className="divide-y max-h-[560px] overflow-y-auto">
            {samples.map(({ route, sample, vehicle, driver }) => (
              <li key={route.id} className="p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{route.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{vehicle?.registration_no ?? "—"}</span> ·{" "}
                    {driver?.full_name ?? "—"}
                  </div>
                  {sample.status === "on_route" && sample.nextStop && (
                    <div className="text-xs mt-1 flex items-center gap-1">
                      <MapPin className="size-3" /> Next: {sample.nextStop.name}{" "}
                      <span className="text-muted-foreground">
                        · ETA {sample.etaMinutesToNextStop}m
                      </span>
                    </div>
                  )}
                  {sample.status === "at_stop" && sample.currentStop && (
                    <div className="text-xs mt-1 flex items-center gap-1">
                      <MapPin className="size-3" /> At: {sample.currentStop.name}
                    </div>
                  )}
                  {sample.status === "idle" && (
                    <div className="text-xs mt-1 flex items-center gap-1 text-muted-foreground">
                      <Clock className="size-3" /> Outside operating window
                    </div>
                  )}
                </div>
                <Badge className={statusBadgeClass(sample.status)}>
                  {statusLabel(sample.status)}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="rounded-2xl overflow-hidden min-w-0">
          <div className="aspect-[4/3] sm:aspect-[16/10] bg-muted relative">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            {shown.map(({ route, sample }) => (
              <div
                key={route.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                style={{ left: `${sample.positionPct.x}%`, top: `${sample.positionPct.y}%` }}
              >
                <div
                  className={`size-3 rounded-full shadow-lg ${sample.status === "on_route" ? "bg-emerald-500 animate-pulse" : sample.status === "at_stop" ? "bg-blue-500" : "bg-slate-400"}`}
                />
                <div className="mt-1 rounded bg-background/95 border px-1.5 py-0.5 text-[10px] font-mono whitespace-nowrap">
                  {route.name.replace(/ Route - /, " · ")}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

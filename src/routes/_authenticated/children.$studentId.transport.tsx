import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, MapPin, Clock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  simulatePosition,
  statusLabel,
  statusBadgeClass,
  type SimRoute,
  type SimStop,
} from "@/lib/fleet-simulation";

export const Route = createFileRoute("/_authenticated/children/$studentId/transport")({
  component: Page,
});

function Page() {
  const { studentId } = Route.useParams();
  const nav = useNavigate();

  const { data: assignment } = useQuery({
    queryKey: ["child-transport", studentId],
    queryFn: () => apiGet<any>(`/students/${studentId}/transport`),
  });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 4000);
    return () => clearInterval(id);
  }, []);

  const simRoute: SimRoute | null = useMemo(() => {
    const r: any = assignment?.route;
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      vehicle_id: r.vehicle_id,
      driver_id: r.driver_id,
      stops: ((r.route_stops as SimStop[]) ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        sequence: s.sequence,
        estimated_minutes: s.estimated_minutes ?? 0,
      })),
    };
  }, [assignment]);

  const sample = simRoute ? simulatePosition(simRoute, now) : null;
  const myStop: any = assignment?.stop;
  const myStopSim = simRoute && myStop ? simRoute.stops.find((s) => s.id === myStop.id) : null;

  let etaToMyStop: number | null = null;
  if (sample && myStopSim && sample.status !== "off_duty" && sample.status !== "idle") {
    const diff = myStopSim.estimated_minutes - sample.minutesSinceStart;
    etaToMyStop = diff > 0 ? diff : 0;
  }

  return (
    <>
      <div className="mb-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => nav({ to: "/children/$studentId", params: { studentId } })}
        >
          <ArrowLeft className="size-4" /> Back to child
        </Button>
      </div>
      <PageHeader
        title="Transport Tracking"
        subtitle="Your child's assigned bus and simulated position."
      />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
        <div>
          <div className="font-medium">Simulated tracking — no GPS hardware installed.</div>
          <div className="text-xs">
            The position and ETA below are calculated from the route schedule for demonstration.
          </div>
        </div>
      </div>

      {!assignment ? (
        <Card className="p-6 rounded-2xl text-sm text-muted-foreground">
          This student is not currently assigned to any transport route. If you use school
          transport, contact the reception office.
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 rounded-2xl min-w-0">
            <div className="text-xs text-muted-foreground">Route</div>
            <div className="text-lg font-semibold">{(assignment.route as any)?.name}</div>
            <div className="mt-2 text-sm">
              <div>
                <span className="text-muted-foreground">Bus:</span>{" "}
                <span className="font-mono">
                  {(assignment.route as any)?.vehicle?.registration_no ?? "—"}
                </span>{" "}
                · {(assignment.route as any)?.vehicle?.model ?? ""}
              </div>
              <div>
                <span className="text-muted-foreground">Driver:</span>{" "}
                {(assignment.route as any)?.driver?.full_name ?? "—"}{" "}
                {(assignment.route as any)?.driver?.phone && (
                  <span className="text-xs text-muted-foreground">
                    · {(assignment.route as any).driver.phone}
                  </span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Pickup stop:</span> {myStop?.name ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Pickup time:</span>{" "}
                {assignment.pickup_time ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Drop time:</span>{" "}
                {assignment.drop_time ?? "—"}
              </div>
            </div>
          </Card>

          <Card className="p-4 rounded-2xl min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-muted-foreground">Bus status right now</div>
              {sample && (
                <Badge className={statusBadgeClass(sample.status)}>
                  {statusLabel(sample.status)}
                </Badge>
              )}
            </div>
            {sample?.status === "on_route" && sample.nextStop && (
              <div className="text-sm mt-2 flex items-center gap-1">
                <MapPin className="size-4" /> Next stop:{" "}
                <span className="font-medium ml-1">{sample.nextStop.name}</span>
              </div>
            )}
            {sample?.status === "at_stop" && sample.currentStop && (
              <div className="text-sm mt-2 flex items-center gap-1">
                <MapPin className="size-4" /> At stop:{" "}
                <span className="font-medium ml-1">{sample.currentStop.name}</span>
              </div>
            )}
            {(sample?.status === "idle" || sample?.status === "off_duty") && (
              <div className="text-sm mt-2 flex items-center gap-1 text-muted-foreground">
                <Clock className="size-4" /> Not currently on a run
              </div>
            )}
            {etaToMyStop !== null && (
              <div className="mt-4 rounded-lg bg-muted/50 p-3">
                <div className="text-xs text-muted-foreground">
                  ETA to your stop ({myStop?.name})
                </div>
                <div className="text-2xl font-semibold">
                  {etaToMyStop === 0 ? "Arrived" : `${etaToMyStop} min`}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/reception/transport")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");
  const { data: routes } = useQuery({
    queryKey: ["rec-routes"],
    queryFn: async () => apiGet<{ id: string; name: string }[]>("/reception/routes"),
  });
  const { data: stops } = useQuery({
    queryKey: ["rec-stops", routeId],
    enabled: !!routeId,
    queryFn: async () =>
      apiGet<{ id: string; name: string; sequence: number }[]>(
        `/reception/routes/${routeId}/stops`,
      ),
  });
  const { data: students } = useQuery({
    queryKey: ["rec-students"],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>("/students?pageSize=100");
      return res.rows.map((s) => ({ id: s.id, profiles: { full_name: s.fullName } }));
    },
  });
  const { data: assignments } = useQuery({
    queryKey: ["rec-assignments"],
    queryFn: async () => {
      const rows = await apiGet<any[]>("/reception/route-students");
      return rows.map((a) => ({
        id: a.id,
        route: { name: a.routeName },
        stop: { name: a.stopName },
        student: { profiles: { full_name: a.studentName } },
      }));
    },
  });

  const assign = useMutation({
    mutationFn: async () =>
      apiFetch("/reception/route-students", {
        method: "POST",
        body: JSON.stringify({ routeId, stopId: stopId || undefined, studentId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rec-assignments"] });
      setStudentId("");
      setStopId("");
      setRouteId("");
    },
  });

  return (
    <>
      <PageHeader
        title="Transport Assignment"
        subtitle="Assign admitted students to a route and stop."
      />
      <Card className="p-4 rounded-2xl mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <Label>Student</Label>
            <select
              className="w-full border rounded-md h-10 px-3"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Select student…</option>
              {(students ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.profiles?.full_name ?? s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Route</Label>
            <select
              className="w-full border rounded-md h-10 px-3"
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
            >
              <option value="">Select route…</option>
              {(routes ?? []).map((r: any) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Stop</Label>
            <select
              className="w-full border rounded-md h-10 px-3"
              value={stopId}
              onChange={(e) => setStopId(e.target.value)}
              disabled={!routeId}
            >
              <option value="">Select stop…</option>
              {(stops ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.sequence}. {s.name}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => assign.mutate()} disabled={!studentId || !routeId || !stopId}>
            Assign
          </Button>
        </div>
      </Card>
      <Card className="rounded-2xl overflow-hidden">
        <div className="p-3 border-b font-medium">Recent assignments</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Student</th>
              <th className="p-3">Route</th>
              <th className="p-3">Stop</th>
            </tr>
          </thead>
          <tbody>
            {(assignments ?? []).map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="p-3">{a.student?.profiles?.full_name ?? "—"}</td>
                <td className="p-3">{a.route?.name}</td>
                <td className="p-3">{a.stop?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

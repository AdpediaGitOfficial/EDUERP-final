import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Users, CheckCircle2, XCircle, ClipboardCheck, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/staff-monitoring")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <Page />
    </RequireRole>
  ),
});

function initials(name: string) {
  return (name || "")
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Page() {
  const [q, setQ] = useState("");

  const { data } = useQuery({
    queryKey: ["monitoring"],
    queryFn: () =>
      apiGet<{
        totals: { total: number; marked: number; pending: number };
        rows: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          markedToday: boolean;
          notesCount: number;
          broadcastCount: number;
          lastBroadcast: string | null;
        }[];
      }>("/access/monitoring"),
  });

  const rows = data?.rows ?? [];
  const totals = data?.totals ?? { total: 0, marked: 0, pending: 0 };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter(
      (p) =>
        !t ||
        (p.full_name || "").toLowerCase().includes(t) ||
        (p.email || "").toLowerCase().includes(t),
    );
  }, [rows, q]);

  return (
    <AppShell>
      <PageHeader
        title="Teacher & Staff Monitoring"
        subtitle="Directory of teachers with today's attendance-marking status and recent activity."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Total teachers</div>
          <div className="text-2xl font-semibold">{totals.total}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Marked attendance today</div>
          <div className="text-2xl font-semibold text-emerald-600">{totals.marked}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="text-2xl font-semibold text-amber-600">{totals.pending}</div>
        </Card>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center gap-3">
          <Users className="size-4 text-muted-foreground" />
          <div className="font-medium">Directory</div>
          <div className="ml-auto relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search teachers…"
              aria-label="Search teachers"
              className="pl-9"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Teacher</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Attendance today</th>
                <th className="p-3">
                  <ClipboardCheck className="size-3 inline" /> Notes (recent)
                </th>
                <th className="p-3">
                  <FileText className="size-3 inline" /> Broadcasts (recent)
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const marked = p.markedToday;
                const notes = p.notesCount;
                const bc = { count: p.broadcastCount, last: p.lastBroadcast };
                return (
                  <tr key={p.id} className="border-t hover:bg-muted/40">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-full bg-secondary text-secondary-foreground grid place-items-center text-xs font-semibold">
                          {initials(p.full_name)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.full_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="truncate">{p.email}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.phone || "—"}</div>
                    </td>
                    <td className="p-3">
                      {marked ? (
                        <Badge className="bg-emerald-100 text-emerald-900 border-0">
                          <CheckCircle2 className="size-3" /> Marked
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-900 border-0">
                          <XCircle className="size-3" /> Pending
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">{notes}</td>
                    <td className="p-3">
                      <div>{bc?.count ?? 0}</div>
                      {bc?.last && (
                        <div className="text-xs text-muted-foreground">
                          last {format(new Date(bc.last), "dd MMM")}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <EmptyRow
                  colSpan={5}
                  title="No teachers found"
                  hint="Try a different search or filter."
                />
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

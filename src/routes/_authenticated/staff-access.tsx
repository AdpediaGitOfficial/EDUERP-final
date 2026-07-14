import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { apiGet, apiFetch } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ShieldCheck, History } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/staff-access")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <Page />
    </RequireRole>
  ),
});

const PERMISSIONS: { key: string; label: string; description: string }[] = [
  {
    key: "attendance.mark",
    label: "Mark attendance",
    description: "Record daily attendance for assigned classes.",
  },
  { key: "gradebook.edit", label: "Edit gradebook", description: "Enter and update exam results." },
  { key: "homework.assign", label: "Assign homework", description: "Create and publish homework." },
  {
    key: "progress.note",
    label: "Write progress notes",
    description: "Add day-wise progress notes for students.",
  },
  {
    key: "broadcast.send",
    label: "Send broadcasts",
    description: "Send messages to parents/classes.",
  },
  {
    key: "complaints.raise",
    label: "Raise complaints",
    description: "File complaints and escalate to admin.",
  },
  {
    key: "reports.view",
    label: "View reports",
    description: "Access aggregate reports and analytics.",
  },
];

const ROLES: AppRole[] = ["admin", "teacher", "student", "parent"];

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
  const { user: me } = useCurrentUser();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: staff } = useQuery({
    queryKey: ["access-staff"],
    queryFn: () => apiGet<any[]>("/access/staff"),
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (staff ?? []).filter(
      (s: any) =>
        !t ||
        (s.full_name || "").toLowerCase().includes(t) ||
        (s.email || "").toLowerCase().includes(t),
    );
  }, [staff, q]);

  const current = useMemo(
    () => (staff ?? []).find((s: any) => s.id === selected) ?? null,
    [staff, selected],
  );

  const { data: perms } = useQuery({
    queryKey: ["access-perms", selected],
    enabled: !!selected,
    queryFn: () => apiGet<any[]>(`/access/permissions/${selected!}`),
  });

  const { data: audit } = useQuery({
    queryKey: ["access-audit", selected],
    enabled: !!selected,
    queryFn: () => apiGet<any[]>(`/access/audit/${selected!}`),
  });

  const permMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of perms ?? []) m.set(p.permission_key, p.enabled);
    return m;
  }, [perms]);

  const write = async (path: string, method: string, body: any) => {
    const res = await apiFetch(path, { method, body: JSON.stringify(body) });
    if (!res || !res.ok) {
      const b = res ? await res.json().catch(() => null) : null;
      throw new Error(b?.message ?? "Request failed");
    }
  };

  const togglePerm = async (key: string, next: boolean) => {
    if (!current || !me) return;
    try {
      await write("/access/permissions", "POST", {
        userId: current.id,
        key,
        enabled: next,
      });
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success(`${next ? "Enabled" : "Disabled"} ${key}`);
    qc.invalidateQueries({ queryKey: ["access-perms", current.id] });
    qc.invalidateQueries({ queryKey: ["access-audit", current.id] });
  };

  const changeRole = async (nextRole: AppRole) => {
    if (!current) return;
    try {
      await write("/access/role", "PATCH", { userId: current.id, role: nextRole });
    } catch (e: any) {
      return toast.error(e.message);
    }
    toast.success(`Role set to ${nextRole}`);
    qc.invalidateQueries({ queryKey: ["access-staff"] });
  };

  const primaryRole: AppRole | null = current?.roles?.[0] ?? null;

  return (
    <AppShell>
      <PageHeader
        title="Staff Access Control"
        subtitle="Change roles and module-level permissions. Permissions are on by default — turning one off revokes that action for the user. Every change is audited."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-6">
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search staff…"
                aria-label="Search staff"
                className="pl-9"
              />
            </div>
          </div>
          <ul className="divide-y max-h-[70vh] overflow-y-auto">
            {filtered.map((s: any) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelected(s.id)}
                  className={`w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 ${selected === s.id ? "bg-muted/60" : ""}`}
                >
                  <div className="size-9 rounded-full bg-secondary grid place-items-center text-xs font-semibold">
                    {initials(s.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.email}</div>
                  </div>
                  <div className="flex gap-1">
                    {s.roles.map((r: string) => (
                      <Badge key={r} variant="secondary" className="capitalize">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">No staff found.</li>
            )}
          </ul>
        </Card>

        <div className="space-y-6">
          {!current ? (
            <Card className="rounded-2xl p-8 text-center text-muted-foreground">
              Select a staff member to manage role and permissions.
            </Card>
          ) : (
            <>
              <Card className="rounded-2xl p-5">
                <div className="flex items-start gap-4">
                  <div className="size-12 rounded-full bg-secondary grid place-items-center text-sm font-semibold">
                    {initials(current.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{current.full_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{current.email}</div>
                  </div>
                  <div className="min-w-[10rem]">
                    <div className="text-xs text-muted-foreground mb-1">Role</div>
                    <Select
                      value={primaryRole ?? undefined}
                      onValueChange={(v) => changeRole(v as AppRole)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Set role" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r} className="capitalize">
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>

              <Card className="rounded-2xl overflow-hidden">
                <div className="p-4 border-b flex items-center gap-2">
                  <ShieldCheck className="size-4" />
                  <div className="font-medium">Permissions</div>
                </div>
                <ul className="divide-y">
                  {PERMISSIONS.map((p) => {
                    // Revoke model: allowed unless an admin has explicitly turned it off.
                    const on = permMap.get(p.key) ?? true;
                    return (
                      <li key={p.key} className="p-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{p.label}</div>
                          <div className="text-xs text-muted-foreground">{p.description}</div>
                        </div>
                        <Switch checked={on} onCheckedChange={(v) => togglePerm(p.key, v)} />
                      </li>
                    );
                  })}
                </ul>
              </Card>

              <Card className="rounded-2xl overflow-hidden">
                <div className="p-4 border-b flex items-center gap-2">
                  <History className="size-4" />
                  <div className="font-medium">Audit log</div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="p-3">When</th>
                        <th className="p-3">Permission</th>
                        <th className="p-3">Change</th>
                        <th className="p-3">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(audit ?? []).map((r: any) => (
                        <tr key={r.id} className="border-t">
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(r.created_at), "dd MMM yyyy · HH:mm")}
                          </td>
                          <td className="p-3 font-mono text-xs">{r.permission_key}</td>
                          <td className="p-3">
                            <span className="text-xs">
                              {r.old_value ? "on" : "off"} →{" "}
                              <span className={r.new_value ? "text-emerald-600" : "text-amber-600"}>
                                {r.new_value ? "on" : "off"}
                              </span>
                            </span>
                          </td>
                          <td className="p-3 text-xs">{r.actor_name}</td>
                        </tr>
                      ))}
                      {(audit ?? []).length === 0 && (
                        <EmptyRow
                          colSpan={4}
                          title="No changes recorded yet"
                          hint="Access changes will be logged here."
                        />
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

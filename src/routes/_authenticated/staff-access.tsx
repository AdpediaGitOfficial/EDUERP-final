import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
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
    queryFn: async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id,role")
        .in("role", ["admin", "teacher"]);
      const ids = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("id", ids);
      const roleMap = new Map<string, AppRole[]>();
      for (const r of roleRows ?? []) {
        const arr = roleMap.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        roleMap.set(r.user_id, arr);
      }
      return (profiles ?? []).map((p: any) => ({ ...p, roles: roleMap.get(p.id) ?? [] }));
    },
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
    queryFn: async () =>
      (
        await supabase
          .from("staff_permissions")
          .select("permission_key,enabled")
          .eq("user_id", selected!)
      ).data ?? [],
  });

  const { data: audit } = useQuery({
    queryKey: ["access-audit", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase
        .from("permission_audit_log")
        .select("id,permission_key,old_value,new_value,created_at,actor_id")
        .eq("target_user_id", selected!)
        .order("created_at", { ascending: false })
        .limit(50);
      const actorIds = Array.from(new Set((data ?? []).map((r: any) => r.actor_id)));
      const actorMap = new Map<string, string>();
      if (actorIds.length) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,full_name")
          .in("id", actorIds);
        for (const p of ps ?? []) actorMap.set(p.id, p.full_name);
      }
      return (data ?? []).map((r: any) => ({ ...r, actor_name: actorMap.get(r.actor_id) ?? "—" }));
    },
  });

  const permMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of perms ?? []) m.set(p.permission_key, p.enabled);
    return m;
  }, [perms]);

  const togglePerm = async (key: string, next: boolean) => {
    if (!current || !me) return;
    const old = permMap.get(key) ?? false;
    const { error } = await supabase
      .from("staff_permissions")
      .upsert(
        { user_id: current.id, permission_key: key, enabled: next },
        { onConflict: "user_id,permission_key" },
      );
    if (error) return toast.error(error.message);
    await supabase.from("permission_audit_log").insert({
      target_user_id: current.id,
      actor_id: me.id,
      permission_key: key,
      old_value: old,
      new_value: next,
    });
    toast.success(`${next ? "Enabled" : "Disabled"} ${key}`);
    qc.invalidateQueries({ queryKey: ["access-perms", current.id] });
    qc.invalidateQueries({ queryKey: ["access-audit", current.id] });
  };

  const changeRole = async (nextRole: AppRole) => {
    if (!current) return;
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", current.id);
    if (delErr) return toast.error(delErr.message);
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: current.id, role: nextRole });
    if (error) return toast.error(error.message);
    toast.success(`Role set to ${nextRole}`);
    qc.invalidateQueries({ queryKey: ["access-staff"] });
  };

  const primaryRole: AppRole | null = current?.roles?.[0] ?? null;

  return (
    <AppShell>
      <PageHeader
        title="Staff Access Control"
        subtitle="Change roles, toggle module-level permissions, and review an audit trail of every change."
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
                    const on = permMap.get(p.key) ?? false;
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
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-muted-foreground text-sm">
                            No changes recorded yet.
                          </td>
                        </tr>
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

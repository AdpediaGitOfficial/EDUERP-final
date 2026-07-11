import { RequireRole } from "@/components/require-role";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { apiGet, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, Users, GitBranch } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parents/")({
  component: () => (
    <RequireRole roles={["admin", "reception"]}>
      <ParentsPage />
    </RequireRole>
  ),
});

type ParentRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  status: string;
  childrenCount: number;
  lastSignInAt: string | null;
};

function ParentsPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const sp = new URLSearchParams({ pageSize: "100" });
    if (q) sp.set("q", q);
    return sp.toString();
  }, [q]);

  const { data, isLoading } = useQuery({
    queryKey: ["parents-list", params],
    queryFn: () => apiGet<{ rows: ParentRow[]; total: number }>(`/parents?${params}`),
  });

  const [addOpen, setAddOpen] = useState(false);

  return (
    <AppShell>
      <PageHeader
        title="Parents"
        subtitle="Search the parent directory, prevent duplicates, and manage guardian links."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/parents/mapping">
                <GitBranch className="size-4" /> Mapping
              </Link>
            </Button>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="size-4" /> Add parent
                </Button>
              </DialogTrigger>
              <AddParentDialog onClose={() => setAddOpen(false)} />
            </Dialog>
          </div>
        }
      />

      <div className="mb-4 relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, mobile, or national ID…"
          className="pl-9"
          aria-label="Search parents"
        />
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-secondary text-muted-foreground">
              <tr className="text-left">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Mobile</th>
                <th className="p-3 font-medium">National ID</th>
                <th className="p-3 font-medium">Children</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3" colSpan={7}>
                      <div className="h-5 w-full animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  {(data?.rows ?? []).map((p) => (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">
                        <Link
                          to="/parents/$parentId"
                          params={{ parentId: p.id }}
                          className="hover:underline"
                        >
                          {p.fullName || "—"}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">{p.email ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{p.phone ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{p.nationalId ?? "—"}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{p.childrenCount}</Badge>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {p.lastSignInAt ? new Date(p.lastSignInAt).toLocaleDateString() : "never"}
                      </td>
                    </tr>
                  ))}
                  {(data?.rows ?? []).length === 0 && (
                    <EmptyRow
                      colSpan={7}
                      title="No parents found"
                      hint="Try a different search, or add a parent."
                    />
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {data.total} parents
          </div>
        )}
      </Card>
    </AppShell>
  );
}

/* ------------ Add parent with search-before-create (duplicate guard) --------- */
type Match = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  children: { studentId: string; name: string | null }[];
};

function AddParentDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    nationalId: "",
    address: "",
    occupation: "",
  });
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Live duplicate check as identifying fields change (the core mechanism).
  useEffect(() => {
    const email = form.email.trim();
    const phone = form.phone.trim();
    const nationalId = form.nationalId.trim();
    if (!email && !phone && !nationalId) {
      setMatches(null);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const sp = new URLSearchParams();
        if (email) sp.set("email", email);
        if (phone) sp.set("phone", phone);
        if (nationalId) sp.set("nationalId", nationalId);
        const res = await apiGet<{ matches: Match[] }>(`/parents/search?${sp.toString()}`);
        setMatches(res.matches);
      } catch {
        setMatches(null);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.email, form.phone, form.nationalId]);

  const create = async () => {
    setSaving(true);
    try {
      const res = await apiPost<{ parentId: string; tempPassword: string }>("/parents", {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        nationalId: form.nationalId.trim() || undefined,
        address: form.address.trim() || undefined,
        occupation: form.occupation.trim() || undefined,
      });
      toast.success(`Parent created. Temp password: ${res.tempPassword}`);
      onClose();
      navigate({ to: "/parents/$parentId", params: { parentId: res.parentId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create parent");
    } finally {
      setSaving(false);
    }
  };

  const hasMatches = (matches?.length ?? 0) > 0;

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Add parent</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          We search existing parents by email, mobile, and national ID first — link the existing
          record instead of creating a duplicate.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="ap-name">Full name</Label>
            <Input id="ap-name" value={form.fullName} onChange={set("fullName")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-email">Email</Label>
            <Input id="ap-email" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-phone">Mobile</Label>
            <Input id="ap-phone" value={form.phone} onChange={set("phone")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-nid">National ID</Label>
            <Input id="ap-nid" value={form.nationalId} onChange={set("nationalId")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-occ">Occupation</Label>
            <Input id="ap-occ" value={form.occupation} onChange={set("occupation")} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="ap-addr">Address</Label>
            <Input id="ap-addr" value={form.address} onChange={set("address")} />
          </div>
        </div>

        {searching && (
          <div className="text-xs text-muted-foreground">Checking for existing parents…</div>
        )}
        {hasMatches && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
            <div className="text-sm font-medium text-amber-900">
              Existing parent{matches!.length > 1 ? "s" : ""} match — link instead of creating a
              duplicate:
            </div>
            {matches!.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 rounded-md bg-background p-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{m.fullName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {m.email ?? "—"} · {m.phone ?? "—"} · {m.children.length} child
                    {m.children.length === 1 ? "" : "ren"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onClose();
                    navigate({ to: "/parents/$parentId", params: { parentId: m.id } });
                  }}
                >
                  Use this parent
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          className="w-full"
          disabled={saving || !form.fullName.trim() || !form.email.trim() || hasMatches}
          onClick={create}
        >
          <Users className="size-4" />
          {hasMatches
            ? "Resolve the match above first"
            : saving
              ? "Creating…"
              : "Create new parent"}
        </Button>
      </div>
    </DialogContent>
  );
}

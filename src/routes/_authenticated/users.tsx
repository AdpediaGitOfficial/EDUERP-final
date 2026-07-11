import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { useConfirm } from "@/components/confirm-dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { Eye, Pencil, Search, Trash2, UserPlus, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/users")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <UsersPage />
    </RequireRole>
  ),
});

const ALL_ROLES: AppRole[] = [
  "admin",
  "teacher",
  "student",
  "parent",
  "hr",
  "accountant",
  "reception",
  "fleet_manager",
];

type UserRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  roles: AppRole[];
  lastSignInAt: string | null;
  createdAt: string;
};

function UsersPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { user: me } = useCurrentUser();

  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Debounce the search box so we hit the API at most ~3×/sec while typing.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const sp = new URLSearchParams({ pageSize: "200" });
    if (debouncedQ) sp.set("q", debouncedQ);
    if (roleFilter !== "all") sp.set("role", roleFilter);
    if (statusFilter !== "all") sp.set("status", statusFilter);
    return sp.toString();
  }, [debouncedQ, roleFilter, statusFilter]);

  const {
    data: users,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["users-list", params],
    queryFn: () => apiGet<{ rows: UserRow[]; total: number }>(`/users?${params}`),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["users-list"] });

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/users/${id}`),
    onSuccess: () => {
      toast.success("User deleted.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete user"),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => apiPatch(`/users/${id}`, { status: "inactive" }),
    onSuccess: () => {
      toast.success("User deactivated — they can no longer sign in.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to deactivate user"),
  });

  const handleDelete = async (u: UserRow) => {
    const ok = await confirm({
      title: `Delete ${u.fullName}?`,
      description:
        "This permanently removes the account and its login. If the user has financial or attendance history it can't be deleted — you'll be offered to deactivate instead.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(u.id);
    } catch {
      // A user with linked records (payments/attendance) can't be hard-deleted;
      // offer the safe alternative that blocks their login without data loss.
      const fallback = await confirm({
        title: `Deactivate ${u.fullName} instead?`,
        description:
          "This account is referenced by other records and can't be permanently deleted. Deactivating blocks their sign-in while keeping the history intact.",
        confirmText: "Deactivate",
        destructive: true,
      });
      if (fallback) deactivateMutation.mutate(u.id);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Users"
        subtitle="Invite, view, edit, deactivate, and remove administrators, teachers, students, and parents."
        action={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="size-4" /> Add user
              </Button>
            </DialogTrigger>
            <AddUserDialog
              onCreated={() => {
                setAddOpen(false);
                invalidate();
              }}
            />
          </Dialog>
        }
      />

      {/* Toolbar: search + filters */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as AppRole | "all")}>
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by role">
            <SelectValue placeholder="Role: all" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Role: all</SelectItem>
            {ALL_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}
        >
          <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filter by status">
            <SelectValue placeholder="Status: all" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Status: all</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {(search || roleFilter !== "all" || statusFilter !== "all") && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              setRoleFilter("all");
              setStatusFilter("all");
            }}
          >
            <X className="size-4" /> Clear
          </Button>
        )}
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-secondary text-muted-foreground">
              <tr className="text-left">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Roles</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Last sign-in</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3" colSpan={6}>
                      <div className="h-5 w-full animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  {(users?.rows ?? []).map((u) => (
                    <tr key={u.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">{u.fullName || "—"}</td>
                      <td className="p-3 text-muted-foreground">{u.email ?? "—"}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge key={r} variant="secondary">
                              {ROLE_LABEL[r] ?? r}
                            </Badge>
                          ))}
                          {u.roles.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() : "never"}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`View ${u.fullName}`}
                            onClick={() => setViewingId(u.id)}
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${u.fullName}`}
                            onClick={() => setEditing(u)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${u.fullName}`}
                            className="text-destructive hover:text-destructive"
                            disabled={me?.id === u.id}
                            onClick={() => handleDelete(u)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(users?.rows ?? []).length === 0 && (
                    <EmptyRow
                      colSpan={6}
                      title="No users found"
                      hint={
                        debouncedQ || roleFilter !== "all" || statusFilter !== "all"
                          ? "Try clearing the search or filters."
                          : "Add your first user to get started."
                      }
                    />
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
        {users && (
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              {users.total} user{users.total === 1 ? "" : "s"}
              {isFetching ? " · updating…" : ""}
            </span>
          </div>
        )}
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <EditUserDialog
            user={editing}
            isSelf={me?.id === editing.id}
            onSaved={() => {
              setEditing(null);
              invalidate();
            }}
          />
        )}
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewingId} onOpenChange={(o) => !o && setViewingId(null)}>
        {viewingId && <ViewUserDialog id={viewingId} />}
      </Dialog>
    </AppShell>
  );
}

/* ------------------------------- Add ------------------------------------ */
function AddUserDialog({ onCreated }: { onCreated: () => void }) {
  const [role, setRole] = useState<AppRole>("student");
  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const fullName = String(form.get("fullName")).trim();
    const phone = String(form.get("phone") ?? "").trim();
    setSaving(true);
    try {
      await apiPost("/users", { fullName, email, password, role, phone: phone || null });
      toast.success(`Account created for ${fullName}. Share the credentials with them.`);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Add a new user</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleCreate} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input name="fullName" required />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input name="email" type="email" required />
        </div>
        <div className="space-y-1.5">
          <Label>Phone (optional)</Label>
          <Input name="phone" type="tel" />
        </div>
        <div className="space-y-1.5">
          <Label>Temporary password</Label>
          <Input name="password" type="text" minLength={6} required defaultValue={"Welcome123!"} />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Creating…" : "Create user"}
        </Button>
      </form>
    </DialogContent>
  );
}

/* ------------------------------- Edit ----------------------------------- */
function EditUserDialog({
  user,
  isSelf,
  onSaved,
}: {
  user: UserRow;
  isSelf: boolean;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [role, setRole] = useState<AppRole>((user.roles[0] as AppRole) ?? "student");
  const [status, setStatus] = useState<"active" | "inactive">(
    user.status === "inactive" ? "inactive" : "active",
  );
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPatch(`/users/${user.id}`, {
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        role,
        status,
      });
      toast.success("User updated.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit user</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={user.email ?? ""} disabled readOnly />
          <p className="text-xs text-muted-foreground">
            Email is the login and can't be changed here.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)} disabled={isSelf}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as "active" | "inactive")}
            disabled={isSelf}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive (blocks sign-in)</SelectItem>
            </SelectContent>
          </Select>
          {isSelf && (
            <p className="text-xs text-muted-foreground">
              You can't change your own role or status.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* ------------------------------- View ----------------------------------- */
function ViewUserDialog({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["user-detail", id],
    queryFn: () =>
      apiGet<{
        id: string;
        fullName: string;
        email: string | null;
        phone: string | null;
        status: string;
        roles: AppRole[];
        lastSignInAt: string | null;
        createdAt: string;
      }>(`/users/${id}`),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>User details</DialogTitle>
      </DialogHeader>
      {isLoading || !data ? (
        <div className="space-y-3 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-5 w-full animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <Field label="Full name" value={data.fullName || "—"} />
          <Field label="Email" value={data.email ?? "—"} />
          <Field label="Phone" value={data.phone ?? "—"} />
          <div className="col-span-3">
            <dt className="text-muted-foreground">Roles</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {data.roles.length ? (
                data.roles.map((r) => (
                  <Badge key={r} variant="secondary">
                    {ROLE_LABEL[r] ?? r}
                  </Badge>
                ))
              ) : (
                <span>—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="mt-1">
              <StatusBadge status={data.status} />
            </dd>
          </div>
          <Field
            label="Last sign-in"
            value={data.lastSignInAt ? new Date(data.lastSignInAt).toLocaleString() : "never"}
          />
          <Field label="Joined" value={new Date(data.createdAt).toLocaleDateString()} />
        </dl>
      )}
    </DialogContent>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium break-words">{value}</dd>
    </div>
  );
}

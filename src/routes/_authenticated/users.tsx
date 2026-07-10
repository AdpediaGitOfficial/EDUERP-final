import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createUserByAdmin } from "@/lib/create-user.functions";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/users")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <UsersPage />
    </RequireRole>
  ),
});

function UsersPage() {
  const qc = useQueryClient();
  const { data: users } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,full_name,email,phone,created_at")
        .order("created_at", { ascending: false });
      const { data: roles } = await supabase.from("user_roles").select("user_id,role");
      const byUser = new Map<string, AppRole[]>();
      (roles ?? []).forEach((r) => {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        byUser.set(r.user_id, arr);
      });
      return (profiles ?? []).map((p) => ({ ...p, roles: byUser.get(p.id) ?? [] }));
    },
  });

  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AppRole>("student");
  const [saving, setSaving] = useState(false);
  const createUser = useServerFn(createUserByAdmin);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const fullName = String(form.get("fullName")).trim();
    const phone = String(form.get("phone") ?? "").trim();
    setSaving(true);
    try {
      await createUser({ data: { fullName, email, password, role, phone: phone || null } });
      toast.success(`Account created for ${fullName}. Share the credentials with them.`);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["users-list"] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create user";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Users"
        subtitle="Manage administrators, teachers, students, and parents."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="size-4" /> Add user
              </Button>
            </DialogTrigger>
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
                  <Input
                    name="password"
                    type="text"
                    minLength={6}
                    required
                    defaultValue={"Welcome123!"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        [
                          "admin",
                          "teacher",
                          "student",
                          "parent",
                          "hr",
                          "accountant",
                          "reception",
                          "fleet_manager",
                        ] as AppRole[]
                      ).map((r) => (
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
          </Dialog>
        }
      />
      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground">
              <tr className="text-left">
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Roles</th>
                <th className="p-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="p-3 font-medium">{u.full_name}</td>
                  <td className="p-3 text-muted-foreground">{u.email}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r} variant="secondary">
                          {ROLE_LABEL[r]}
                        </Badge>
                      ))}
                      {u.roles.length === 0 && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {(users ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

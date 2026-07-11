import { RequireRole } from "@/components/require-role";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { apiGet, apiPatch } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, niceLabel } from "@/lib/module-util";
import { toast } from "sonner";
import { useState } from "react";
import { Pencil, Mail, Phone, IdCard, MapPin, Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parents/$parentId")({
  component: () => (
    <RequireRole roles={["admin", "reception"]}>
      <ParentProfilePage />
    </RequireRole>
  ),
});

type Profile = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  nationalId: string | null;
  address: string | null;
  occupation: string | null;
  status: string;
  children: {
    studentId: string;
    relationshipType: string;
    name: string | null;
    admissionNo: string | null;
    rollNo: string | null;
    className: string | null;
  }[];
  feeSummary: { totalDue: number; totalPaid: number; outstanding: number };
  login: { lastSignInAt: string | null; confirmed: boolean; active: boolean };
  communications: { id: string; subject: string | null; sentAt: string; readAt: string | null }[];
};

function Field({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: any;
}) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="size-3" />} {label}
      </div>
      <div className="font-medium break-words">{value ?? "—"}</div>
    </div>
  );
}

function ParentProfilePage() {
  const { parentId } = Route.useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data } = useQuery({
    queryKey: ["parent-profile", parentId],
    queryFn: () => apiGet<Profile>(`/parents/${parentId}`),
  });

  if (!data) {
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">Loading parent…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4">
        <Link to="/parents" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to parents
        </Link>
      </div>
      <PageHeader
        title={data.fullName}
        subtitle={`Parent · ${data.children.length} linked child${data.children.length === 1 ? "" : "ren"}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={data.status} />
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4 mr-1" /> Edit
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="rounded-2xl p-6 lg:col-span-2">
          <div className="font-medium text-sm mb-4">Contact & personal</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <Field label="Email" value={data.email} icon={Mail} />
            <Field label="Mobile" value={data.phone} icon={Phone} />
            <Field label="National ID" value={data.nationalId} icon={IdCard} />
            <Field label="Occupation" value={data.occupation} icon={Briefcase} />
            <Field label="Address" value={data.address} icon={MapPin} />
          </div>
        </Card>

        <Card className="rounded-2xl p-6">
          <div className="font-medium text-sm mb-4">Portal login</div>
          <div className="space-y-3 text-sm">
            <Field
              label="Last sign-in"
              value={
                data.login.lastSignInAt
                  ? new Date(data.login.lastSignInAt).toLocaleString()
                  : "never"
              }
            />
            <Field
              label="Account"
              value={
                <Badge
                  className={
                    data.login.active
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {data.login.active ? "Active" : "Deactivated"}
                </Badge>
              }
            />
            <Field label="Email confirmed" value={data.login.confirmed ? "Yes" : "No"} />
          </div>
        </Card>
      </div>

      {/* Fee summary across all children */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <Card className="rounded-2xl p-5">
          <div className="text-2xl font-semibold">{money(data.feeSummary.totalDue)}</div>
          <div className="text-xs text-muted-foreground">Total assigned (all children)</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="text-2xl font-semibold text-emerald-600">
            {money(data.feeSummary.totalPaid)}
          </div>
          <div className="text-xs text-muted-foreground">Paid</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="text-2xl font-semibold text-red-600">
            {money(data.feeSummary.outstanding)}
          </div>
          <div className="text-xs text-muted-foreground">Outstanding</div>
        </Card>
      </div>

      {/* Linked children */}
      <Card className="rounded-2xl overflow-hidden mt-4">
        <div className="p-4 border-b font-medium text-sm">Linked children</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Student</th>
                <th className="p-3">Relationship</th>
                <th className="p-3">Class</th>
                <th className="p-3">Admission #</th>
                <th className="p-3">Roll #</th>
              </tr>
            </thead>
            <tbody>
              {data.children.map((c) => (
                <tr key={c.studentId} className="border-t">
                  <td className="p-3 font-medium">
                    <Link
                      to="/children/$studentId"
                      params={{ studentId: c.studentId }}
                      className="hover:underline"
                    >
                      {c.name ?? "—"}
                    </Link>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">{niceLabel(c.relationshipType)}</Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{c.className ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{c.admissionNo ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{c.rollNo ?? "—"}</td>
                </tr>
              ))}
              {data.children.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">
                    No children linked yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Communication history */}
      <Card className="rounded-2xl overflow-hidden mt-4">
        <div className="p-4 border-b font-medium text-sm">Communication history</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-3">Subject</th>
                <th className="p-3">Sent</th>
                <th className="p-3">Read</th>
              </tr>
            </thead>
            <tbody>
              {data.communications.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-3">{c.subject ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(c.sentAt).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {c.readAt ? (
                      <Badge className="bg-emerald-100 text-emerald-800">Read</Badge>
                    ) : (
                      <Badge variant="secondary">Unread</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {data.communications.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-muted-foreground text-sm">
                    No messages sent to this parent yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <EditParentDialog
        open={editing}
        onOpenChange={setEditing}
        profile={data}
        onSaved={() => {
          setEditing(false);
          qc.invalidateQueries({ queryKey: ["parent-profile", parentId] });
        }}
      />
    </AppShell>
  );
}

function EditParentDialog({
  open,
  onOpenChange,
  profile,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profile: Profile;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    fullName: profile.fullName,
    phone: profile.phone ?? "",
    nationalId: profile.nationalId ?? "",
    address: profile.address ?? "",
    occupation: profile.occupation ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiPatch(`/parents/${profile.id}`, {
        fullName: form.fullName.trim(),
        phone: form.phone.trim() || null,
        nationalId: form.nationalId.trim() || null,
        address: form.address.trim() || null,
        occupation: form.occupation.trim() || null,
      });
      toast.success("Parent updated.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit parent</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="pp-name">Full name</Label>
            <Input id="pp-name" value={form.fullName} onChange={set("fullName")} required />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Email</Label>
            <Input value={profile.email ?? ""} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-phone">Mobile</Label>
            <Input id="pp-phone" value={form.phone} onChange={set("phone")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-nid">National ID</Label>
            <Input id="pp-nid" value={form.nationalId} onChange={set("nationalId")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-occ">Occupation</Label>
            <Input id="pp-occ" value={form.occupation} onChange={set("occupation")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-addr">Address</Label>
            <Input id="pp-addr" value={form.address} onChange={set("address")} />
          </div>
          <DialogFooter className="col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

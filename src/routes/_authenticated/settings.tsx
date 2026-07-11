import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AuthedImage } from "@/components/authed-image";
import { FileUpload } from "@/components/file-upload";
import { apiFetch, apiGet } from "@/lib/api/client";
import { toast } from "sonner";
import { useState } from "react";
import { ROLE_LABEL } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: profile } = useQuery({
    enabled: !!user?.id,
    queryKey: ["my-profile", user?.id],
    queryFn: () => apiGet<{ avatarUrl: string | null }>(`/users/${user!.id}`),
  });

  const initials =
    (user?.fullName ?? "")
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const res = await apiFetch("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ fullName: name || user.fullName, phone: phone || null }),
    });
    setSaving(false);
    if (!res || !res.ok) {
      const b = res ? await res.json().catch(() => null) : null;
      return toast.error(b?.message ?? "Could not save");
    }
    toast.success("Saved");
  };

  return (
    <AppShell>
      <PageHeader title="Settings" subtitle="Your profile and preferences." />
      <Card className="p-6 rounded-2xl max-w-xl">
        <h2 className="font-display font-semibold text-lg mb-4">Profile</h2>
        <div className="mb-6 flex items-center gap-4">
          <Avatar className="size-16">
            <AuthedImage
              src={profile?.avatarUrl}
              alt="Profile photo"
              className="size-16 rounded-full object-cover"
              fallback={<AvatarFallback className="text-lg">{initials}</AvatarFallback>}
            />
          </Avatar>
          <FileUpload
            category="avatars"
            accept="image/*"
            label="Change photo"
            onUploaded={async (meta) => {
              const res = await apiFetch("/users/me", {
                method: "PATCH",
                body: JSON.stringify({ avatarUrl: meta.url }),
              });
              if (!res || !res.ok) throw new Error("Could not update photo");
              await qc.invalidateQueries({ queryKey: ["my-profile", user?.id] });
            }}
          />
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input
              placeholder={user?.fullName}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Input disabled value={user?.primaryRole ? ROLE_LABEL[user.primaryRole] : ""} />
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>
    </AppShell>
  );
}

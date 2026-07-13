import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiFetch } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ROLE_LABEL } from "@/lib/roles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound, Eye, EyeOff, UserCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function AccountPage() {
  const { user } = useCurrentUser();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Password must be at least 6 characters.");
    if (pw !== confirm) return toast.error("Passwords don't match.");
    setSaving(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ newPassword: pw }),
      });
      toast.success("Password updated. Use it next time you sign in.");
      setPw("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Account" subtitle="Your login details and password." />

      <div className="max-w-xl space-y-4">
        {/* Identity */}
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-secondary grid place-items-center">
              <UserCircle className="size-6 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="font-display text-lg font-semibold truncate">
                {user?.fullName ?? "—"}
              </div>
              <div className="text-sm text-muted-foreground truncate">{user?.email ?? "—"}</div>
            </div>
            {user?.primaryRole && (
              <span className="ml-auto text-xs rounded-full bg-secondary px-2.5 py-1 text-muted-foreground">
                {ROLE_LABEL[user.primaryRole]}
              </span>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Your username is your email above. For security, passwords are stored only as encrypted
            hashes and can never be viewed — set a new one below if you need to change it.
          </p>
        </Card>

        {/* Change password */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4 font-medium">
            <KeyRound className="size-4 text-primary" /> Change password
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>New password</Label>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Confirm new password</Label>
              <Input
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter the new password"
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-center justify-between">
              <Link to="/auth" className="text-xs text-muted-foreground hover:text-foreground">
                Forgot your password? Reset via email
              </Link>
              <Button type="submit" disabled={saving || !pw || !confirm}>
                {saving ? "Saving…" : "Update password"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}

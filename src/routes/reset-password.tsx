import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiResetPassword } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return toast.error("This reset link is invalid or has expired");
    setLoading(true);
    try {
      // On success the API returns a fresh session, so we land signed in.
      await apiResetPassword(token, password);
      toast.success("Password updated");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <Card className="w-full max-w-md p-8 rounded-2xl">
        <h1 className="font-display text-2xl font-semibold">Set a new password</h1>
        {!token && (
          <p className="mt-2 text-sm text-destructive">
            This reset link is missing its token. Request a new link from the sign-in page.
          </p>
        )}
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pw">New password</Label>
            <Input
              id="pw"
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading || !token}>
            {loading ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

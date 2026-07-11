import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiLogin, apiRegister, apiRequestPasswordReset, getApiToken } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Greenwood School" },
      { name: "description", content: "Sign in to access the Greenwood school management portal." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getApiToken()) navigate({ to: "/dashboard", replace: true });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        await apiLogin(email, password);
        toast.success("Welcome back");
        navigate({ to: "/dashboard", replace: true });
      } else if (mode === "signup") {
        await apiRegister(email, password, fullName);
        toast.success("Account created — welcome to Greenwood.");
        navigate({ to: "/dashboard", replace: true });
      } else {
        // The API never reveals whether the address has an account, so the
        // message is deliberately unconditional.
        await apiRequestPasswordReset(email);
        toast.success("If that email has an account, a reset link is on its way.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary to-[oklch(0.4_0.2_290)] text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-white/15 grid place-items-center">
            <GraduationCap className="size-6" />
          </div>
          <span className="font-display text-xl font-semibold">Greenwood International</span>
        </div>
        <div className="space-y-4">
          <h1 className="font-display text-5xl leading-tight">
            School management, all in one place.
          </h1>
          <p className="text-primary-foreground/80 text-lg max-w-md">
            Fees, timetables, holidays, announcements — with dedicated portals for administrators,
            teachers, students, and parents.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">
          © {new Date().getFullYear()} Greenwood International
        </p>
      </div>
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 rounded-2xl shadow-sm border">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="size-9 rounded-lg bg-primary grid place-items-center text-primary-foreground">
              <GraduationCap className="size-5" />
            </div>
            <span className="font-display font-semibold">Greenwood</span>
          </div>
          <h2 className="font-display text-2xl font-semibold">
            {mode === "signin" && "Welcome back"}
            {mode === "signup" && "Create your account"}
            {mode === "forgot" && "Reset your password"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" && "Sign in to your Greenwood portal"}
            {mode === "signup" && "The first account becomes the school administrator"}
            {mode === "forgot" && "We'll email you a reset link"}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="fn">Full name</Label>
                <Input
                  id="fn"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="em">Email</Label>
              <Input
                id="em"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pw">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs text-primary hover:underline"
                    >
                      Forgot?
                    </button>
                  )}
                </div>
                <Input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : "Send reset link"}
            </Button>
          </form>
          {mode === "signin" && (
            <div className="mt-6 rounded-lg border bg-muted/40 p-3 text-xs">
              <p className="font-medium mb-2">
                Demo accounts (password: <code>Greenwood@2026</code>)
              </p>
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-1 text-muted-foreground">
                {[
                  ["Admin", "admin@greenwood.test"],
                  ["Teacher", "teacher@greenwood.test"],
                  ["Student", "student@greenwood.test"],
                  ["Parent", "parent@greenwood.test"],
                ].map(([label, addr]) => (
                  <button
                    key={addr}
                    type="button"
                    onClick={() => {
                      setEmail(addr);
                      setPassword("Greenwood@2026");
                    }}
                    className="text-left hover:text-primary min-w-0 truncate"
                  >
                    <span className="font-medium text-foreground">{label}:</span> {addr}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-6 text-sm text-center text-muted-foreground">
            {mode === "signin" ? (
              <>
                New here?{" "}
                <button className="text-primary hover:underline" onClick={() => setMode("signup")}>
                  Create an account
                </button>
              </>
            ) : (
              <button className="text-primary hover:underline" onClick={() => setMode("signin")}>
                Back to sign in
              </button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

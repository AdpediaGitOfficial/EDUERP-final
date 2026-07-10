import type { ReactNode } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { AppRole } from "@/lib/roles";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { user, loading } = useCurrentUser();
  if (loading) return null;
  if (user && user.primaryRole && roles.includes(user.primaryRole)) return <>{children}</>;
  return (
    <AppShell>
      <PageHeader title="Not authorized" subtitle="You don't have access to this area." />
      <Card className="p-8 rounded-2xl flex items-center gap-4">
        <div className="size-12 rounded-xl bg-destructive/10 text-destructive grid place-items-center">
          <ShieldAlert className="size-6" />
        </div>
        <div>
          <div className="font-medium">Restricted section</div>
          <p className="text-sm text-muted-foreground">
            This module is limited to authorized roles. Contact an administrator if you need access.
          </p>
        </div>
      </Card>
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { niceLabel } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/ess/assets")({ component: Page });

function Page() {
  const { user } = useCurrentUser();
  const { data } = useQuery({
    queryKey: ["me-assets", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("assets").select("*").eq("assigned_to_profile_id", user!.id)).data ?? [],
  });
  return (
    <>
      <PageHeader title="My Assets" subtitle="Assets allocated to you." />
      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Code</th>
              <th className="p-3">Name</th>
              <th className="p-3">Status</th>
              <th className="p-3">Condition</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="p-3 font-mono text-xs">{a.asset_code}</td>
                <td className="p-3">{a.name}</td>
                <td className="p-3">{niceLabel(a.status)}</td>
                <td className="p-3">{niceLabel(a.condition ?? "—")}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <EmptyRow
                colSpan={4}
                title="No assets assigned"
                hint="Items issued to you will appear here."
              />
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

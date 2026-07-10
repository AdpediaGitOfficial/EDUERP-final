import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { fmtDate } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/ess/training")({ component: Page });

function Page() {
  const { user } = useCurrentUser();
  const { data: staff } = useQuery({
    queryKey: ["me-s4", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("staff").select("id").eq("profile_id", user!.id).maybeSingle()).data,
  });
  const { data } = useQuery({
    queryKey: ["me-training", staff?.id],
    enabled: !!staff,
    queryFn: async () =>
      (
        await supabase
          .from("training_attendance")
          .select("*, program:program_id(title, start_date, end_date, program_type, provider)")
          .eq("staff_id", staff!.id)
      ).data ?? [],
  });
  return (
    <>
      <PageHeader title="My Training" subtitle="Programs attended and upcoming." />
      <div className="grid md:grid-cols-2 gap-3">
        {(data ?? []).map((t: any) => (
          <Card key={t.id} className="p-4 rounded-2xl">
            <div className="font-medium">{t.program?.title}</div>
            <div className="text-xs text-muted-foreground">
              {t.program?.provider} · {t.program?.program_type}
            </div>
            <div className="text-xs mt-1">
              {fmtDate(t.program?.start_date)} → {fmtDate(t.program?.end_date)}
            </div>
            {t.rating && <div className="text-xs mt-1">Your rating: {t.rating}/5</div>}
          </Card>
        ))}
        {(data ?? []).length === 0 && (
          <Card className="p-8 rounded-2xl text-center text-muted-foreground md:col-span-2">
            No training records.
          </Card>
        )}
      </div>
    </>
  );
}

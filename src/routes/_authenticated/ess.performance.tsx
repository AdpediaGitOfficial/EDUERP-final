import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/ess/performance")({ component: Page });

function Page() {
  const { user } = useCurrentUser();
  const { data: tid } = useQuery({
    queryKey: ["me-t2", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const staff = (
        await supabase.from("staff").select("id").eq("profile_id", user!.id).maybeSingle()
      ).data;
      if (!staff) return null;
      return (await supabase.from("teachers").select("id").eq("staff_id", staff.id).maybeSingle())
        .data;
    },
  });
  const { data } = useQuery({
    queryKey: ["me-perf", tid?.id],
    enabled: !!tid,
    queryFn: async () =>
      (
        await supabase
          .from("teacher_performance_reviews")
          .select("*")
          .eq("teacher_id", tid!.id)
          .order("period", { ascending: false })
      ).data ?? [],
  });
  return (
    <>
      <PageHeader title="My Performance" subtitle="Review history and feedback." />
      <div className="grid md:grid-cols-2 gap-3">
        {(data ?? []).map((r: any) => (
          <Card key={r.id} className="p-4 rounded-2xl">
            <div className="font-medium">{r.period}</div>
            <div className="text-2xl font-semibold text-amber-600">{r.rating} / 5</div>
            <div className="text-sm text-muted-foreground mt-2">{r.notes}</div>
          </Card>
        ))}
        {(data ?? []).length === 0 && (
          <Card className="p-8 md:col-span-2 rounded-2xl text-center text-muted-foreground">
            No reviews yet.
          </Card>
        )}
      </div>
    </>
  );
}

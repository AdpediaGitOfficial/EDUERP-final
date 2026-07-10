import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { UserPlus, PhoneCall, CheckCircle2, XCircle, Users, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reception/")({ component: Page });

function Page() {
  const { data: enquiries } = useQuery({
    queryKey: ["rec-enq"],
    queryFn: async () =>
      (await supabase.from("admission_enquiries").select("id,status")).data ?? [],
  });
  const { data: visitors } = useQuery({
    queryKey: ["rec-vis"],
    queryFn: async () =>
      (await supabase.from("visitor_logs").select("id,check_in,check_out")).data ?? [],
  });
  const cnt = (s: string) => (enquiries ?? []).filter((e: any) => e.status === s).length;
  const active = (visitors ?? []).filter((v: any) => !v.check_out).length;
  const total = (visitors ?? []).length;
  return (
    <>
      <PageHeader
        title="Reception Dashboard"
        subtitle="Admissions pipeline and today's visitors."
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat icon={UserPlus} label="New" value={cnt("new")} tint="text-blue-600" />
        <Stat icon={PhoneCall} label="Follow-up" value={cnt("follow_up")} tint="text-amber-600" />
        <Stat
          icon={CheckCircle2}
          label="Converted"
          value={cnt("converted")}
          tint="text-emerald-600"
        />
        <Stat icon={XCircle} label="Lost" value={cnt("lost")} tint="text-slate-500" />
        <Stat icon={Users} label="Visitors today" value={total} tint="text-foreground" />
        <Stat icon={Clock} label="Currently in" value={active} tint="text-emerald-600" />
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: any;
  label: string;
  value: number;
  tint: string;
}) {
  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <Icon className={`size-4 ${tint}`} />
      </div>
      <div className={`text-2xl font-semibold mt-1 ${tint}`}>{value}</div>
    </Card>
  );
}

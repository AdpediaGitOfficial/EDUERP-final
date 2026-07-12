import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { UserPlus, PhoneCall, CheckCircle2, XCircle, Users, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reception/")({ component: Page });

function Page() {
  const { data } = useQuery({
    queryKey: ["reception-dashboard"],
    queryFn: async () => apiGet<any>("/reception/dashboard"),
  });
  const cnt = (s: string) => data?.enquiries?.[s] ?? 0;
  const active = data?.visitors?.active ?? 0;
  const total = data?.visitors?.total ?? 0;
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
        <Stat icon={XCircle} label="Lost" value={cnt("lost")} tint="text-muted-foreground" />
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

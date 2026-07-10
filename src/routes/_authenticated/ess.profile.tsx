import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { fmtDate, niceLabel } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/ess/profile")({ component: Page });

function Page() {
  const { user } = useCurrentUser();
  const { data: staff } = useQuery({
    queryKey: ["me-profile", user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("staff").select("*").eq("profile_id", user!.id).maybeSingle()).data,
  });
  if (!staff) return <div className="p-8 text-sm text-muted-foreground">No record linked.</div>;
  const ec = staff.emergency_contact as any;
  const bd = staff.bank_details as any;
  return (
    <>
      <PageHeader title="My Profile" subtitle="Personal details on file. Contact HR for changes." />
      <Card className="p-6 rounded-2xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        <F l="Name" v={staff.full_name} />
        <F l="Employee code" v={staff.employee_code} />
        <F l="Email" v={staff.email} />
        <F l="Phone" v={staff.phone} />
        <F l="Department" v={staff.department} />
        <F l="Designation" v={staff.designation} />
        <F l="Employment" v={niceLabel(staff.employment_type)} />
        <F l="Join date" v={fmtDate(staff.join_date)} />
        <F l="Blood group" v={staff.blood_group} />
        <F l="Address" v={staff.address} />
        <F l="Emergency contact" v={ec ? `${ec.name} · ${ec.phone}` : "—"} />
        <F l="Bank" v={bd ? `${bd.bank} · ${bd.account}` : "—"} />
        <F l="Skills" v={(staff.skills ?? []).join(", ") || "—"} />
      </Card>
    </>
  );
}

function F({ l, v }: { l: string; v: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{l}</div>
      <div className="font-medium">{v ?? "—"}</div>
    </div>
  );
}

import { RequireRole } from "@/components/require-role";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadCsv } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/teachers/")({
  component: () => (
    <RequireRole roles={["admin", "hr"]}>
      <TeachersPage />
    </RequireRole>
  ),
});

type Teacher = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  subject: string;
  qualification: string | null;
  experience_years: number;
  joined_date: string;
  status: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function TeachersPage() {
  const [q, setQ] = useState("");
  const { data: teachers } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers" as never)
        .select("*")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as unknown as Teacher[];
    },
  });

  const filtered = useMemo(() => {
    const list = teachers ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter(
      (t) =>
        t.full_name.toLowerCase().includes(s) ||
        t.email.toLowerCase().includes(s) ||
        t.subject.toLowerCase().includes(s),
    );
  }, [teachers, q]);

  const active = (teachers ?? []).filter((t) => t.status === "active").length;

  return (
    <AppShell>
      <PageHeader title="Teachers" subtitle="Faculty directory and teaching staff on record." />

      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <Card className="rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
              <Users className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-semibold">{teachers?.length ?? 0}</div>
              <div className="text-xs text-muted-foreground">Total staff</div>
            </div>
          </div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="text-2xl font-semibold text-emerald-600">{active}</div>
          <div className="text-xs text-muted-foreground">Active</div>
        </Card>
        <Card className="rounded-2xl p-5">
          <div className="text-2xl font-semibold">
            {new Set((teachers ?? []).map((t) => t.subject)).size}
          </div>
          <div className="text-xs text-muted-foreground">Subjects covered</div>
        </Card>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, subject or email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="text-sm text-muted-foreground ml-auto mr-2">
            {filtered.length} of {teachers?.length ?? 0}
          </div>
          <Button size="sm" variant="outline" onClick={() => downloadCsv(filtered, "teachers")}>
            <Download className="size-4 mr-1" /> Export CSV
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground">
              <tr className="text-left">
                <th className="p-3 font-medium">Teacher</th>
                <th className="p-3 font-medium">Subject</th>
                <th className="p-3 font-medium">Qualification</th>
                <th className="p-3 font-medium">Experience</th>
                <th className="p-3 font-medium">Contact</th>
                <th className="p-3 font-medium">Joined</th>
                <th className="p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-t hover:bg-muted/40 cursor-pointer">
                  <td className="p-3">
                    <Link
                      to="/teachers/$teacherId"
                      params={{ teacherId: t.id }}
                      className="flex items-center gap-3"
                    >
                      <div className="size-9 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold">
                        {initials(t.full_name)}
                      </div>
                      <div>
                        <div className="font-medium hover:underline">{t.full_name}</div>
                        <div className="text-xs text-muted-foreground">{t.email}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="p-3">
                    <Badge variant="secondary">{t.subject}</Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">{t.qualification ?? "—"}</td>
                  <td className="p-3">{t.experience_years} yrs</td>
                  <td className="p-3 text-muted-foreground">{t.phone ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(t.joined_date).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-medium dark:bg-emerald-500/10 dark:text-emerald-400">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No teachers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}

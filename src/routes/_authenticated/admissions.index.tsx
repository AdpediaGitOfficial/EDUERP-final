import { RequireRole } from "@/components/require-role";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { ADMISSION_STAGES, STAGE_LABEL, stageBadgeClass } from "@/lib/admission-stages";

export const Route = createFileRoute("/_authenticated/admissions/")({
  component: () => (
    <RequireRole roles={["admin", "reception"]}>
      <AdmissionsPage />
    </RequireRole>
  ),
});

type Row = {
  id: string;
  studentName: string;
  stage: string;
  admissionNo: string | null;
  gradeApplying: string | null;
  parentName: string | null;
  updatedAt: string;
};

function AdmissionsPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<string>("all");
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const sp = new URLSearchParams({ pageSize: "200" });
    if (q) sp.set("q", q);
    if (stage !== "all") sp.set("stage", stage);
    return sp.toString();
  }, [q, stage]);

  const { data, isLoading } = useQuery({
    queryKey: ["admissions", params],
    queryFn: () => apiGet<{ rows: Row[]; total: number }>(`/admissions?${params}`),
  });

  return (
    <AppShell>
      <PageHeader
        title="Admissions"
        subtitle="Track applications through the admission workflow."
        action={
          <Button asChild>
            <Link to="/admissions/new">
              <Plus className="size-4" /> New admission
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student, admission #, or parent…"
            className="pl-9"
            aria-label="Search admissions"
          />
        </div>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-full sm:w-[220px]" aria-label="Filter by stage">
            <SelectValue placeholder="Stage: all" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Stage: all</SelectItem>
            {[...ADMISSION_STAGES, "rejected"].map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-secondary text-muted-foreground">
              <tr className="text-left">
                <th className="p-3 font-medium">Student</th>
                <th className="p-3 font-medium">Admission #</th>
                <th className="p-3 font-medium">Grade</th>
                <th className="p-3 font-medium">Stage</th>
                <th className="p-3 font-medium">Parent</th>
                <th className="p-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3" colSpan={6}>
                      <div className="h-5 w-full animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  {(data?.rows ?? []).map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">
                        <Link
                          to="/admissions/$admissionId"
                          params={{ admissionId: r.id }}
                          className="hover:underline"
                        >
                          {r.studentName}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground font-mono text-xs">
                        {r.admissionNo ?? "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">{r.gradeApplying ?? "—"}</td>
                      <td className="p-3">
                        <Badge className={stageBadgeClass(r.stage)}>
                          {STAGE_LABEL[r.stage] ?? r.stage}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{r.parentName ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(r.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {(data?.rows ?? []).length === 0 && (
                    <EmptyRow
                      colSpan={6}
                      title="No admissions found"
                      hint="Start a new admission or adjust filters."
                    />
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {data.total} admissions
          </div>
        )}
      </Card>
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiGet, apiFetch } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { GraduationCap, ArrowRight, History } from "lucide-react";
import { fmtDate, type Tone } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/academics/promote")({ component: Page });

type ClassRow = { id: string; name: string; section: string | null; academicYear: string };
type Preview = {
  fromClass: { id: string; name: string; session: string };
  students: { id: string; name: string; rollNo: string | null; admissionNo: string | null }[];
};
type Batch = {
  batchId: string;
  date: string;
  fromSession: string | null;
  toSession: string | null;
  promoted: number;
  detained: number;
  rows: { studentName: string; fromClass: string; toClass: string; result: string }[];
};

const RESULT_TONE: Record<string, Tone> = {
  promoted: "success",
  detained: "warning",
  passed_out: "info",
};

function Page() {
  const qc = useQueryClient();
  const [fromClass, setFromClass] = useState("");
  const [toClass, setToClass] = useState("");
  const [results, setResults] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: classes } = useQuery({
    queryKey: ["academic-classes-all"],
    queryFn: () => apiGet<ClassRow[]>("/classes"),
  });
  const { data: preview } = useQuery({
    queryKey: ["promotion-preview", fromClass],
    queryFn: () => apiGet<Preview>(`/academics/promotion/preview?fromClassId=${fromClass}`),
    enabled: !!fromClass,
  });
  const { data: register } = useQuery({
    queryKey: ["promotion-register"],
    queryFn: () => apiGet<Batch[]>("/academics/promotion/register"),
  });

  // Default everyone to "promoted" when the preview loads.
  useEffect(() => {
    if (preview) {
      const init: Record<string, string> = {};
      for (const s of preview.students) init[s.id] = "promoted";
      setResults(init);
    }
  }, [preview]);

  const classLabel = (c: ClassRow) => `${c.name}${c.section ? ` ${c.section}` : ""} · ${c.academicYear}`;
  const promotedCount = Object.values(results).filter((r) => r === "promoted").length;

  const execute = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/academics/promotion/execute", {
        method: "POST",
        body: JSON.stringify({
          from_class_id: fromClass,
          to_class_id: toClass || undefined,
          promotions: (preview?.students ?? []).map((s) => ({
            student_id: s.id,
            result: results[s.id] ?? "promoted",
          })),
        }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not run promotion");
      }
      return res.json().catch(() => ({}));
    },
    onSuccess: (r: any) => {
      toast.success(`Promotion complete — ${r?.promoted ?? 0} promoted, ${r?.detained ?? 0} detained`);
      setFromClass("");
      setToClass("");
      qc.invalidateQueries({ queryKey: ["promotion-register"] });
      qc.invalidateQueries({ queryKey: ["academic-classes-all"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Runner */}
      <Card className="rounded-2xl p-4">
        <h3 className="font-semibold mb-3">Promote students</h3>
        <div className="grid md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground">From class-section</label>
            <Select value={fromClass || undefined} onValueChange={setFromClass}>
              <SelectTrigger>
                <SelectValue placeholder="Source class" />
              </SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {classLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ArrowRight className="size-5 text-muted-foreground mb-2 mx-auto hidden md:block" />
          <div>
            <label className="text-xs text-muted-foreground">To class-section (promoted → )</label>
            <Select value={toClass || undefined} onValueChange={setToClass}>
              <SelectTrigger>
                <SelectValue placeholder="Target class" />
              </SelectTrigger>
              <SelectContent>
                {(classes ?? [])
                  .filter((c) => c.id !== fromClass)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {classLabel(c)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!fromClass ? (
          <EmptyState
            className="mt-4"
            icon={GraduationCap}
            title="Pick a source class"
            hint="Choose the class-section to promote from, and its target for the next session."
          />
        ) : (preview?.students ?? []).length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No active students in this class.</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="p-3 font-medium">Roll</th>
                    <th className="p-3 font-medium">Student</th>
                    <th className="p-3 font-medium">Admission</th>
                    <th className="p-3 font-medium w-40">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview?.students ?? []).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-3">{s.rollNo ?? "—"}</td>
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 font-mono text-xs">{s.admissionNo ?? "—"}</td>
                      <td className="p-3">
                        <Select
                          value={results[s.id] ?? "promoted"}
                          onValueChange={(v) => setResults({ ...results, [s.id]: v })}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="promoted">Promote</SelectItem>
                            <SelectItem value="detained">Detain</SelectItem>
                            <SelectItem value="passed_out">Passed out</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {promotedCount} of {preview?.students.length} to promote
                {promotedCount > 0 && !toClass && (
                  <span className="text-amber-600"> — pick a target class</span>
                )}
              </p>
              <Button
                onClick={() => execute.mutate()}
                disabled={promotedCount > 0 && !toClass}
              >
                Run promotion
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* Register */}
      <Card className="rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <History className="size-4" />
          <h3 className="font-semibold">Promotion register</h3>
        </div>
        {register && register.length === 0 ? (
          <p className="text-sm text-muted-foreground">No promotions recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {(register ?? []).map((b) => (
              <div key={b.batchId} className="rounded-xl border">
                <button
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30"
                  onClick={() => setExpanded(expanded === b.batchId ? null : b.batchId)}
                >
                  <div className="text-sm">
                    <span className="font-medium">{fmtDate(b.date)}</span>
                    <span className="text-muted-foreground ml-2">
                      {b.fromSession} → {b.toSession}
                    </span>
                  </div>
                  <div className="flex-1" />
                  <StatusBadge tone="success" label={`${b.promoted} promoted`} />
                  {b.detained > 0 && <StatusBadge tone="warning" label={`${b.detained} detained`} />}
                </button>
                {expanded === b.batchId && (
                  <div className="border-t p-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="py-1">Student</th>
                          <th className="py-1">From</th>
                          <th className="py-1">To</th>
                          <th className="py-1">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {b.rows.map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="py-1.5">{r.studentName}</td>
                            <td className="py-1.5">{r.fromClass}</td>
                            <td className="py-1.5">{r.toClass}</td>
                            <td className="py-1.5">
                              <StatusBadge tone={RESULT_TONE[r.result] ?? "neutral"} label={r.result} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

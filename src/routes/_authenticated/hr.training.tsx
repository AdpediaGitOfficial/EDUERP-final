import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { fmtDate, money } from "@/lib/module-util";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/training")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const {
    data: programs,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["training-programs"],
    queryFn: () => apiGet<any[]>("/hr/training/programs"),
  });
  const { data: attendance } = useQuery({
    queryKey: ["training-attendance-all"],
    queryFn: () => apiGet<any[]>("/hr/training/attendance"),
  });

  const upcoming = (programs ?? []).filter(
    (p: any) => p.start_date && new Date(p.start_date) > new Date(),
  );
  const past = (programs ?? []).filter((p: any) => p.end_date && new Date(p.end_date) < new Date());

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    title: "",
    program_type: "workshop",
    provider: "",
    start_date: "",
    end_date: "",
    cost: 0,
    skill_tags: [],
  });
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/hr/training/programs", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not create program");
      }
    },
    onSuccess: () => {
      toast.success("Program created");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["training-programs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Training & Development"
        subtitle="Programs, workshops and certifications."
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4 mr-1" />
            New program
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Total programs</div>
          <div className="text-2xl font-semibold">{(programs ?? []).length}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Upcoming</div>
          <div className="text-2xl font-semibold text-blue-600">{upcoming.length}</div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="text-xs text-muted-foreground">Completed</div>
          <div className="text-2xl font-semibold text-emerald-600">{past.length}</div>
        </Card>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-3">Program</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Provider</th>
                  <th className="p-3">Dates</th>
                  <th className="p-3">Attended</th>
                  <th className="p-3">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(programs ?? []).map((p: any) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">{p.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {(p.skill_tags ?? []).join(", ")}
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary">{p.program_type}</Badge>
                    </td>
                    <td className="p-3">{p.provider}</td>
                    <td className="p-3">
                      {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                    </td>
                    <td className="p-3">
                      {(attendance ?? []).filter((a: any) => a.program_id === p.id).length}
                    </td>
                    <td className="p-3">{money(p.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New training program</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={form.program_type}
                onValueChange={(v) => setForm({ ...form, program_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workshop">Workshop</SelectItem>
                  <SelectItem value="course">Course</SelectItem>
                  <SelectItem value="certification">Certification</SelectItem>
                  <SelectItem value="seminar">Seminar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Provider</Label>
              <Input
                value={form.provider}
                onChange={(e) => setForm({ ...form, provider: e.target.value })}
              />
            </div>
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Cost</Label>
              <Input
                type="number"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Skill tags (comma-separated)</Label>
              <Input
                value={form.skill_tags.join(", ")}
                onChange={(e) =>
                  setForm({
                    ...form,
                    skill_tags: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!form.title}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

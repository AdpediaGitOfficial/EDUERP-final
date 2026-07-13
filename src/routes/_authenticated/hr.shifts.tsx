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
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hr/shifts")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const {
    data: shifts,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => apiGet<any[]>("/hr/shifts"),
  });
  const { data: assigns } = useQuery({
    queryKey: ["staff-shifts"],
    queryFn: () => apiGet<any[]>("/hr/staff-shifts"),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    name: "",
    start_time: "09:00",
    end_time: "17:00",
    shift_type: "regular",
    weekly_off: ["Sunday"],
  });
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/hr/shifts", { method: "POST", body: JSON.stringify(form) });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not create shift");
      }
    },
    onSuccess: () => {
      toast.success("Shift created");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader
        title="Shift Management"
        subtitle="Shift definitions and staff assignments."
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4 mr-1" />
            New shift
          </Button>
        }
      />
      {isError ? (
        <Card className="rounded-2xl mb-6">
          <QueryError onRetry={() => refetch()} />
        </Card>
      ) : isLoading ? (
        <Card className="rounded-2xl overflow-hidden mb-6">
          <TableSkeleton rows={6} cols={4} />
        </Card>
      ) : (
        <div className="grid md:grid-cols-4 gap-3 mb-6">
          {(shifts ?? []).map((s: any) => (
            <Card key={s.id} className="p-4 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="font-medium">{s.name}</div>
                <Badge>{s.shift_type}</Badge>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {s.start_time} – {s.end_time}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Off: {(s.weekly_off ?? []).join(", ")}
              </div>
              <div className="text-xs mt-2">
                Assigned: {(assigns ?? []).filter((a: any) => a.shift_id === s.id).length}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Card className="rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Employee</th>
              <th className="p-3">Department</th>
              <th className="p-3">Shift</th>
              <th className="p-3">Effective From</th>
            </tr>
          </thead>
          <tbody>
            {(assigns ?? []).map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="p-3">{a.staff?.full_name}</td>
                <td className="p-3">{a.staff?.department}</td>
                <td className="p-3">{a.shift?.name}</td>
                <td className="p-3">{a.effective_from}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New shift</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Start</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </div>
            <div>
              <Label>End</Label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={form.shift_type}
                onValueChange={(v) => setForm({ ...form, shift_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                  <SelectItem value="flexible">Flexible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Weekly off (comma-separated)</Label>
              <Input
                value={form.weekly_off.join(", ")}
                onChange={(e) =>
                  setForm({
                    ...form,
                    weekly_off: e.target.value
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
            <Button onClick={() => save.mutate()} disabled={!form.name}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiGet } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { fmtDateTime } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/reception/visitors")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    purpose: "",
    meeting_person: "",
    department: "",
    id_reference: "",
  });
  const { data } = useQuery({
    queryKey: ["visitors"],
    queryFn: async () => {
      const rows = await apiGet<any[]>("/reception/visitors");
      return rows.map((v) => ({
        id: v.id,
        name: v.name,
        purpose: v.purpose,
        meeting_person: v.meetingPerson,
        department: v.department,
        check_in: v.checkIn,
        check_out: v.checkOut,
      }));
    },
  });
  const checkIn = useMutation({
    mutationFn: async () =>
      apiFetch("/reception/visitors", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          purpose: form.purpose,
          meetingPerson: form.meeting_person || undefined,
          department: form.department || undefined,
          idReference: form.id_reference || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visitors"] });
      setForm({ name: "", purpose: "", meeting_person: "", department: "", id_reference: "" });
    },
  });
  const checkOut = useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/reception/visitors/${id}/checkout`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visitors"] }),
  });
  const active = (data ?? []).filter((v: any) => !v.check_out);
  const history = (data ?? []).filter((v: any) => v.check_out);

  return (
    <>
      <PageHeader
        title="Visitor Management"
        subtitle="Check-in and check-out of school visitors."
      />
      <Card className="p-4 rounded-2xl mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Purpose</Label>
            <Input
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
            />
          </div>
          <div>
            <Label>Meeting person</Label>
            <Input
              value={form.meeting_person}
              onChange={(e) => setForm({ ...form, meeting_person: e.target.value })}
            />
          </div>
          <div>
            <Label>Department</Label>
            <Input
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
          </div>
          <Button onClick={() => checkIn.mutate()} disabled={!form.name || !form.purpose}>
            Check in
          </Button>
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-3 border-b font-medium">Currently in ({active.length})</div>
          <ul className="divide-y">
            {active.map((v: any) => (
              <li key={v.id} className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{v.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {v.purpose} · with {v.meeting_person} ({v.department})
                  </div>
                  <div className="text-xs">Since {fmtDateTime(v.check_in)}</div>
                </div>
                <Button size="sm" onClick={() => checkOut.mutate(v.id)}>
                  Check out
                </Button>
              </li>
            ))}
            {active.length === 0 && (
              <li>
                <EmptyState
                  compact
                  title="No visitors currently in"
                  hint="Check in a visitor to see them here."
                />
              </li>
            )}
          </ul>
        </Card>
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-3 border-b font-medium">History</div>
          <ul className="divide-y max-h-[65vh] overflow-y-auto">
            {history.map((v: any) => (
              <li key={v.id} className="p-3">
                <div className="font-medium">{v.name}</div>
                <div className="text-xs text-muted-foreground">
                  {v.purpose} · with {v.meeting_person}
                </div>
                <div className="text-xs">
                  {fmtDateTime(v.check_in)} → {fmtDateTime(v.check_out)}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

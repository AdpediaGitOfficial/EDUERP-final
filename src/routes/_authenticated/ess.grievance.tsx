import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { badgeClass, fmtDateTime, niceLabel } from "@/lib/module-util";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ess/grievance")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["ess-grievances"],
    queryFn: () => apiGet<any[]>("/ess/grievances"),
  });
  const [form, setForm] = useState({ subject: "", message: "" });
  const mut = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/ess/grievances", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (!res || !res.ok) {
        const body = res ? await res.json().catch(() => null) : null;
        throw new Error(body?.message ?? "Could not submit");
      }
    },
    onSuccess: () => {
      toast.success("Submitted");
      setForm({ subject: "", message: "" });
      qc.invalidateQueries({ queryKey: ["ess-grievances"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader title="Grievance" subtitle="Submit and track concerns confidentially." />
      <Card className="p-4 rounded-2xl mb-4 space-y-3">
        <div>
          <Label>Subject</Label>
          <Input
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
        </div>
        <div>
          <Label>Message</Label>
          <Textarea
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </div>
        <Button onClick={() => mut.mutate()} disabled={!form.subject || !form.message}>
          Submit
        </Button>
      </Card>
      <div className="space-y-2">
        {(data ?? []).map((g: any) => (
          <Card key={g.id} className="p-4 rounded-2xl">
            <div className="flex justify-between">
              <div className="font-medium">{g.subject}</div>
              <Badge className={badgeClass(g.status === "open" ? "pending" : "approved")}>
                {niceLabel(g.status)}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground mt-1">{g.message}</div>
            <div className="text-xs text-muted-foreground mt-2">
              Submitted {fmtDateTime(g.created_at)}
            </div>
            {g.response && (
              <div className="text-sm mt-2 border-t pt-2">
                <b>Response:</b> {g.response}
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

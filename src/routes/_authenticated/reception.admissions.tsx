import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import { badgeClass, fmtDate, niceLabel, todayISO } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/reception/admissions")({ component: Page });

const STAGES: { key: "new" | "follow_up" | "converted" | "lost"; label: string }[] = [
  { key: "new", label: "New" },
  { key: "follow_up", label: "Follow-up" },
  { key: "converted", label: "Converted" },
  { key: "lost", label: "Lost" },
];

function Page() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    student_name: "",
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    grade_applying: "",
    enquiry_date: todayISO(),
    status: "new",
    notes: "",
  });
  const { data } = useQuery({
    queryKey: ["adm-enq"],
    queryFn: async () =>
      (
        await supabase
          .from("admission_enquiries")
          .select("*")
          .order("enquiry_date", { ascending: false })
      ).data ?? [],
  });

  const add = useMutation({
    mutationFn: async () => await supabase.from("admission_enquiries").insert(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adm-enq"] });
      setOpen(false);
      setForm({
        student_name: "",
        parent_name: "",
        parent_phone: "",
        parent_email: "",
        grade_applying: "",
        enquiry_date: todayISO(),
        status: "new",
        notes: "",
      });
    },
  });
  const move = useMutation({
    mutationFn: async (v: { id: string; status: string }) =>
      await supabase.from("admission_enquiries").update({ status: v.status }).eq("id", v.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adm-enq"] }),
  });

  return (
    <>
      <PageHeader
        title="Admissions"
        subtitle="Enquiries and admission pipeline."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-1" /> New enquiry
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New admission enquiry</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Student name</Label>
                  <Input
                    value={form.student_name}
                    onChange={(e) => setForm({ ...form, student_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Grade applying</Label>
                  <Input
                    value={form.grade_applying}
                    onChange={(e) => setForm({ ...form, grade_applying: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Parent name</Label>
                  <Input
                    value={form.parent_name}
                    onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Parent phone</Label>
                  <Input
                    value={form.parent_phone}
                    onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Parent email</Label>
                  <Input
                    value={form.parent_email}
                    onChange={(e) => setForm({ ...form, parent_email: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Button onClick={() => add.mutate()} disabled={!form.student_name}>
                    Save
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {STAGES.map((st) => {
          const items = (data ?? []).filter((e: any) => e.status === st.key);
          return (
            <Card key={st.key} className="rounded-2xl overflow-hidden">
              <div className="p-3 border-b flex items-center justify-between">
                <div className="font-medium">{st.label}</div>
                <Badge className={badgeClass(st.key)}>{items.length}</Badge>
              </div>
              <ul className="divide-y max-h-[70vh] overflow-y-auto">
                {items.map((e: any) => (
                  <li key={e.id} className="p-3">
                    <div className="font-medium">{e.student_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.grade_applying} · {fmtDate(e.enquiry_date)}
                    </div>
                    <div className="text-xs mt-1">
                      {e.parent_name} · {e.parent_phone}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {STAGES.filter((s) => s.key !== st.key).map((s) => (
                        <Button
                          key={s.key}
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => move.mutate({ id: e.id, status: s.key })}
                        >
                          → {niceLabel(s.label)}
                        </Button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}

import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, MessageSquare, AlertTriangle, ArrowUpRight, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/complaints")({
  component: () => (
    <RequireRole roles={["admin", "teacher", "parent"]}>
      <Page />
    </RequireRole>
  ),
});

const SEV: Record<string, string> = {
  low: "bg-slate-100 text-slate-900",
  medium: "bg-amber-100 text-amber-900",
  high: "bg-red-100 text-red-900",
};
const STATUS: Record<string, string> = {
  open: "bg-blue-100 text-blue-900",
  in_progress: "bg-amber-100 text-amber-900",
  resolved: "bg-emerald-100 text-emerald-900",
  closed: "bg-slate-100 text-slate-900",
};

function Page() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [studentId, setStudentId] = useState("");
  const [severity, setSeverity] = useState("medium");

  const role = user?.primaryRole;
  const canRaise = role === "teacher" || role === "admin";

  const { data: students } = useQuery({
    queryKey: ["compl-students", role, user?.id],
    enabled: !!user,
    queryFn: async () =>
      (
        await supabase
          .from("students")
          .select("id,admission_no,profiles(full_name),classes(name,section)")
          .order("admission_no")
      ).data ?? [],
  });

  const { data: complaints } = useQuery({
    queryKey: ["complaints-list"],
    queryFn: async () =>
      (
        await supabase
          .from("complaints")
          .select(
            "id,subject,body,severity,status,student_id,raised_by,escalated_to_admin,created_at,updated_at,students(admission_no,profiles(full_name))",
          )
          .order("updated_at", { ascending: false })
      ).data ?? [],
  });

  const { data: messages } = useQuery({
    queryKey: ["complaint-msgs", selected],
    enabled: !!selected,
    queryFn: async () =>
      (
        await supabase
          .from("complaint_messages")
          .select("id,body,sender_id,created_at,profiles:sender_id(full_name)")
          .eq("complaint_id", selected!)
          .order("created_at", { ascending: true })
      ).data ?? [],
  });

  const selectedComplaint = useMemo(
    () => (complaints ?? []).find((c) => c.id === selected),
    [complaints, selected],
  );

  const raise = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !studentId) return toast.error("Pick a student");
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("complaints").insert({
      student_id: studentId,
      raised_by: user.id,
      subject: String(fd.get("subject") || ""),
      body: String(fd.get("body") || ""),
      severity,
    });
    if (error) return toast.error(error.message);
    toast.success("Complaint raised");
    setOpen(false);
    setStudentId("");
    qc.invalidateQueries({ queryKey: ["complaints-list"] });
  };

  const reply = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !selected) return;
    const fd = new FormData(e.currentTarget);
    const body = String(fd.get("msg") || "").trim();
    if (!body) return;
    const { error } = await supabase.from("complaint_messages").insert({
      complaint_id: selected,
      sender_id: user.id,
      body,
    });
    if (error) return toast.error(error.message);
    await supabase
      .from("complaints")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", selected);
    (e.target as HTMLFormElement).reset();
    qc.invalidateQueries({ queryKey: ["complaint-msgs", selected] });
    qc.invalidateQueries({ queryKey: ["complaints-list"] });
  };

  const changeStatus = async (status: string) => {
    if (!selected) return;
    const { error } = await supabase.from("complaints").update({ status }).eq("id", selected);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["complaints-list"] });
  };

  const escalate = async () => {
    if (!selected) return;
    const { error } = await supabase
      .from("complaints")
      .update({ escalated_to_admin: true })
      .eq("id", selected);
    if (error) return toast.error(error.message);
    toast.success("Escalated to admin");
    qc.invalidateQueries({ queryKey: ["complaints-list"] });
  };

  return (
    <AppShell>
      <PageHeader
        title="Complaints"
        subtitle="Raise concerns and chat with parents or the admin team."
        action={
          canRaise && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" /> Raise complaint
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Raise a complaint</DialogTitle>
                </DialogHeader>
                <form onSubmit={raise} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Student</Label>
                    <Select value={studentId} onValueChange={setStudentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a student" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {(students ?? []).map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.profiles?.full_name} · {s.admission_no}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Severity</Label>
                    <Select value={severity} onValueChange={setSeverity}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Subject</Label>
                    <Input name="subject" required maxLength={140} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Details</Label>
                    <Textarea name="body" required rows={4} maxLength={2000} />
                  </div>
                  <Button type="submit" className="w-full">
                    Raise complaint
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b font-medium">Threads</div>
          <ul className="divide-y max-h-[70vh] overflow-y-auto">
            {(complaints ?? []).map((c: any) => (
              <li
                key={c.id}
                onClick={() => setSelected(c.id)}
                className={`p-4 cursor-pointer hover:bg-muted/40 ${selected === c.id ? "bg-muted/60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm truncate">{c.subject}</div>
                  <Badge className={`${SEV[c.severity] ?? ""} border-0 capitalize text-[10px]`}>
                    {c.severity}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {c.students?.profiles?.full_name} · {c.students?.admission_no}
                </div>
                <div className="flex items-center justify-between mt-2 gap-2">
                  <Badge className={`${STATUS[c.status] ?? ""} border-0 capitalize text-[10px]`}>
                    {c.status.replace("_", " ")}
                  </Badge>
                  {c.escalated_to_admin && (
                    <span className="text-[10px] text-red-600 inline-flex items-center gap-1">
                      <ArrowUpRight className="size-3" />
                      escalated
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {format(new Date(c.updated_at), "dd MMM · HH:mm")}
                  </span>
                </div>
              </li>
            ))}
            {(complaints ?? []).length === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">No complaints yet.</li>
            )}
          </ul>
        </Card>

        <Card className="rounded-2xl overflow-hidden flex flex-col">
          {selectedComplaint ? (
            <>
              <div className="p-4 border-b">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{selectedComplaint.subject}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      Re: {(selectedComplaint as any).students?.profiles?.full_name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={selectedComplaint.status} onValueChange={changeStatus}>
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In progress</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    {role === "teacher" && !selectedComplaint.escalated_to_admin && (
                      <Button size="sm" variant="outline" onClick={escalate}>
                        <AlertTriangle className="size-3" /> Escalate
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">
                  {selectedComplaint.body}
                </p>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 max-h-[45vh]">
                {(messages ?? []).map((m: any) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                      >
                        {!mine && (
                          <div className="text-[10px] font-medium mb-0.5 opacity-70">
                            {m.profiles?.full_name}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap">{m.body}</div>
                        <div
                          className={`text-[10px] mt-1 ${mine ? "opacity-70" : "text-muted-foreground"}`}
                        >
                          {format(new Date(m.created_at), "dd MMM · HH:mm")}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(messages ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No replies yet.</p>
                )}
              </div>
              <form onSubmit={reply} className="p-3 border-t flex gap-2">
                <Input name="msg" placeholder="Type a reply…" autoComplete="off" />
                <Button type="submit" size="icon">
                  <Send className="size-4" />
                </Button>
              </form>
            </>
          ) : (
            <div className="p-12 text-center text-sm text-muted-foreground flex-1 grid place-items-center">
              <div>
                <MessageSquare className="size-8 mx-auto mb-3 opacity-40" />
                Select a thread to view the conversation.
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

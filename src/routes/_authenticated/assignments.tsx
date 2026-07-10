import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RequireRole } from "@/components/require-role";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format, isPast, isToday, differenceInCalendarDays, parseISO } from "date-fns";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  NotebookPen,
  Paperclip,
  Star,
  Upload,
  AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/assignments")({
  component: AssignmentsPage,
});

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  assigned_date: string;
  due_date: string;
  priority: "high" | "medium" | "low";
  attachment_url: string | null;
  attachment_type: string | null;
  max_marks: number | null;
  subjects: { id: string; name: string } | null;
  teacher: { full_name: string | null } | null;
  submission: {
    id: string;
    status: "pending" | "submitted" | "reviewed" | "overdue";
    submitted_at: string | null;
    attachment_url: string | null;
    note: string | null;
    marks: number | null;
    remarks: string | null;
  } | null;
};

function AssignmentsPage() {
  return (
    <RequireRole roles={["student"]}>
      <AppShell>
        <AssignmentsInner />
      </AppShell>
    </RequireRole>
  );
}

function AssignmentsInner() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState<Assignment | null>(null);

  const { data, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["student-assignments", user?.id],
    queryFn: async () => {
      const { data: student } = await supabase
        .from("students")
        .select("id, class_id, classes(name, section)")
        .eq("profile_id", user!.id)
        .maybeSingle();
      if (!student?.class_id) return { student: null, items: [] as Assignment[] };

      const { data: hw } = await supabase
        .from("homework")
        .select(
          "id,title,description,assigned_date,due_date,priority,attachment_url,attachment_type,max_marks,teacher_id,subject_id,subjects(id,name)",
        )
        .eq("class_id", student.class_id)
        .order("due_date", { ascending: true });

      const list = hw ?? [];
      const teacherIds = Array.from(new Set(list.map((h: any) => h.teacher_id).filter(Boolean)));
      const ids = list.map((h: any) => h.id);

      const [{ data: profs }, { data: subs }] = await Promise.all([
        teacherIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", teacherIds)
          : Promise.resolve({ data: [] as any[] }),
        ids.length
          ? supabase
              .from("homework_submissions")
              .select("id,homework_id,status,submitted_at,attachment_url,note,marks,remarks")
              .in("homework_id", ids)
              .eq("student_id", student.id)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const teacherMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const subMap = new Map((subs ?? []).map((s: any) => [s.homework_id, s]));

      const items: Assignment[] = list.map((h: any) => {
        const sub = subMap.get(h.id) ?? null;
        const overdue = !sub && new Date(h.due_date) < new Date(new Date().toDateString());
        return {
          id: h.id,
          title: h.title,
          description: h.description,
          assigned_date: h.assigned_date,
          due_date: h.due_date,
          priority: (h.priority as any) ?? "medium",
          attachment_url: h.attachment_url,
          attachment_type: h.attachment_type,
          max_marks: h.max_marks,
          subjects: h.subjects,
          teacher: teacherMap.get(h.teacher_id) ?? null,
          submission: sub
            ? sub
            : overdue
              ? {
                  id: "",
                  status: "overdue",
                  submitted_at: null,
                  attachment_url: null,
                  note: null,
                  marks: null,
                  remarks: null,
                }
              : null,
        };
      });

      return { student, items };
    },
  });

  const submit = useMutation({
    mutationFn: async (payload: { homeworkId: string; attachment_url: string; note: string }) => {
      const { data: student } = await supabase
        .from("students")
        .select("id")
        .eq("profile_id", user!.id)
        .maybeSingle();
      if (!student) throw new Error("Student profile not found");
      const { error } = await supabase.from("homework_submissions").upsert(
        {
          homework_id: payload.homeworkId,
          student_id: student.id,
          status: "submitted",
          submitted_at: new Date().toISOString(),
          attachment_url: payload.attachment_url || null,
          note: payload.note || null,
        },
        { onConflict: "homework_id,student_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Submission uploaded");
      qc.invalidateQueries({ queryKey: ["student-assignments"] });
      qc.invalidateQueries({ queryKey: ["student-dash"] });
      setOpen(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to submit"),
  });

  const items = data?.items ?? [];

  const groups = useMemo(() => {
    const today: Assignment[] = [];
    const upcoming: Assignment[] = [];
    const overdue: Assignment[] = [];
    const completed: Assignment[] = [];
    for (const a of items) {
      const due = parseISO(a.due_date);
      const st = a.submission?.status;
      if (st === "submitted" || st === "reviewed") completed.push(a);
      else if (st === "overdue") overdue.push(a);
      else if (isToday(due)) today.push(a);
      else if (isPast(due)) overdue.push(a);
      else upcoming.push(a);
    }
    return { today, upcoming, overdue, completed };
  }, [items]);

  const bySubject = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        pending: number;
        completed: number;
        nextDue: string | null;
        items: Assignment[];
      }
    >();
    for (const a of items) {
      const key = a.subjects?.name ?? "General";
      const entry = map.get(key) ?? {
        name: key,
        pending: 0,
        completed: 0,
        nextDue: null as string | null,
        items: [],
      };
      const st = a.submission?.status;
      if (st === "submitted" || st === "reviewed") entry.completed += 1;
      else entry.pending += 1;
      if (st !== "submitted" && st !== "reviewed") {
        if (!entry.nextDue || new Date(a.due_date) < new Date(entry.nextDue))
          entry.nextDue = a.due_date;
      }
      entry.items.push(a);
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const cls = (data?.student as any)?.classes;
  const clsName = cls ? `${cls.name}${cls.section ? ` - ${cls.section}` : ""}` : "";

  return (
    <>
      <PageHeader
        title="Assignments"
        subtitle={clsName ? `Daily tasks for ${clsName}` : "Your daily tasks"}
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryPill
          label="Today"
          count={groups.today.length}
          tone="sky"
          icon={<Calendar className="size-4" />}
        />
        <SummaryPill
          label="Upcoming"
          count={groups.upcoming.length}
          tone="indigo"
          icon={<Clock className="size-4" />}
        />
        <SummaryPill
          label="Overdue"
          count={groups.overdue.length}
          tone="coral"
          icon={<AlertCircle className="size-4" />}
        />
        <SummaryPill
          label="Completed"
          count={groups.completed.length}
          tone="violet"
          icon={<CheckCircle2 className="size-4" />}
        />
      </div>

      {isLoading && (
        <Card className="p-8 rounded-2xl text-muted-foreground">Loading assignments…</Card>
      )}

      {!isLoading && items.length === 0 && (
        <Card className="p-8 rounded-2xl text-center text-muted-foreground">
          <NotebookPen className="size-8 mx-auto mb-2 opacity-50" />
          No assignments yet.
        </Card>
      )}

      {items.length > 0 && (
        <>
          <Section
            title="Today"
            items={groups.today}
            onOpen={setOpen}
            emptyText="Nothing due today."
          />
          <Section
            title="Overdue"
            items={groups.overdue}
            onOpen={setOpen}
            emptyText="No overdue tasks."
          />
          <Section
            title="Upcoming"
            items={groups.upcoming}
            onOpen={setOpen}
            emptyText="No upcoming tasks."
          />
          <Section
            title="Completed"
            items={groups.completed}
            onOpen={setOpen}
            emptyText="Nothing submitted yet."
          />

          <div className="mt-8">
            <div className="font-display text-lg font-semibold mb-3">By Subject</div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {bySubject.map((s) => (
                <Card key={s.name} className="p-4 rounded-2xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-8 rounded-lg bg-secondary grid place-items-center shrink-0">
                        <BookOpen className="size-4 text-primary" />
                      </div>
                      <div className="font-medium truncate">{s.name}</div>
                    </div>
                    <Badge variant="secondary">{s.items.length}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{s.pending} pending</span>
                    <span>·</span>
                    <span>{s.completed} done</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {s.nextDue
                      ? `Next due ${format(parseISO(s.nextDue), "MMM d")}`
                      : "All caught up"}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}

      <SubmitDialog
        assignment={open}
        onClose={() => setOpen(null)}
        onSubmit={(p) => submit.mutate(p)}
        pending={submit.isPending}
      />
    </>
  );
}

function SummaryPill({
  label,
  count,
  tone,
  icon,
}: {
  label: string;
  count: number;
  tone: "sky" | "indigo" | "violet" | "coral";
  icon: React.ReactNode;
}) {
  const bg = {
    sky: "bg-stat-sky text-stat-sky-foreground",
    indigo: "bg-stat-indigo text-stat-indigo-foreground",
    violet: "bg-stat-violet text-stat-violet-foreground",
    coral: "bg-stat-coral text-stat-coral-foreground",
  }[tone];
  return (
    <div className={`rounded-2xl p-4 ${bg}`}>
      <div className="flex items-center gap-2 text-sm opacity-90">
        {icon}
        {label}
      </div>
      <div className="font-display text-3xl font-semibold mt-1">{count}</div>
    </div>
  );
}

function Section({
  title,
  items,
  onOpen,
  emptyText,
}: {
  title: string;
  items: Assignment[];
  onOpen: (a: Assignment) => void;
  emptyText: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display text-lg font-semibold">{title}</div>
        <Badge variant="secondary">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-2xl p-4">{emptyText}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((a) => (
            <AssignmentCard key={a.id} a={a} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({ a, onOpen }: { a: Assignment; onOpen: (a: Assignment) => void }) {
  const due = parseISO(a.due_date);
  const dLeft = differenceInCalendarDays(due, new Date());
  const dueTone =
    dLeft < 0 ? "text-destructive" : dLeft <= 1 ? "text-amber-600" : "text-muted-foreground";
  return (
    <Card className="p-4 rounded-2xl flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              {a.subjects?.name ?? "General"}
            </Badge>
            <PriorityBadge p={a.priority} />
            <StatusBadge s={a.submission?.status ?? "pending"} />
          </div>
          <div className="font-medium truncate">{a.title}</div>
          <div className="text-xs text-muted-foreground truncate">
            by {a.teacher?.full_name ?? "Teacher"}
          </div>
        </div>
        {a.attachment_url && <AttachmentIcon type={a.attachment_type} />}
      </div>
      {a.description && (
        <p className="text-sm text-muted-foreground line-clamp-2">{a.description}</p>
      )}
      <div className="flex items-center justify-between text-xs">
        <span className={dueTone}>
          <Calendar className="size-3 inline mr-1" />
          Due {format(due, "MMM d")}
          {dLeft >= 0 ? ` · in ${dLeft}d` : ` · ${-dLeft}d late`}
        </span>
        {a.submission?.status === "reviewed" && a.submission.marks != null && (
          <span className="inline-flex items-center gap-1 text-primary font-medium">
            <Star className="size-3" /> {a.submission.marks}
            {a.max_marks ? `/${a.max_marks}` : ""}
          </span>
        )}
      </div>
      {a.submission?.status === "reviewed" && a.submission.remarks && (
        <div className="text-xs bg-secondary/60 rounded-lg p-2">
          <span className="font-medium">Teacher: </span>
          {a.submission.remarks}
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => onOpen(a)} className="flex-1">
          View
        </Button>
        {a.submission?.status !== "reviewed" && (
          <Button size="sm" onClick={() => onOpen(a)} className="flex-1">
            <Upload className="size-3.5 mr-1" />
            {a.submission?.status === "submitted" ? "Resubmit" : "Submit"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function AttachmentIcon({ type }: { type: string | null }) {
  const Icon =
    type === "image"
      ? ImageIcon
      : type === "link"
        ? LinkIcon
        : type === "document"
          ? FileText
          : Paperclip;
  return <Icon className="size-4 text-muted-foreground shrink-0" />;
}

function PriorityBadge({ p }: { p: "high" | "medium" | "low" }) {
  const map = {
    high: "bg-destructive/10 text-destructive border-destructive/30",
    medium: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    low: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${map[p]}`}>
      {p.toUpperCase()}
    </span>
  );
}

function StatusBadge({ s }: { s: "pending" | "submitted" | "reviewed" | "overdue" }) {
  const map = {
    pending: "bg-secondary text-secondary-foreground",
    submitted: "bg-sky-500/10 text-sky-700 border border-sky-500/30",
    reviewed: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/30",
    overdue: "bg-destructive/10 text-destructive border border-destructive/30",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${map[s]}`}>{s.toUpperCase()}</span>
  );
}

function SubmitDialog({
  assignment,
  onClose,
  onSubmit,
  pending,
}: {
  assignment: Assignment | null;
  onClose: () => void;
  onSubmit: (p: { homeworkId: string; attachment_url: string; note: string }) => void;
  pending: boolean;
}) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const a = assignment;
  const canEdit = a && a.submission?.status !== "reviewed";
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && (onClose(), setUrl(""), setNote(""))}>
      <DialogContent className="max-w-lg">
        {a && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">{a.title}</DialogTitle>
              <DialogDescription>
                {a.subjects?.name ?? "General"} · by {a.teacher?.full_name ?? "Teacher"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <PriorityBadge p={a.priority} />
                <StatusBadge s={a.submission?.status ?? "pending"} />
                <span className="text-xs text-muted-foreground">
                  Assigned {format(parseISO(a.assigned_date), "MMM d")} · Due{" "}
                  {format(parseISO(a.due_date), "MMM d")}
                </span>
              </div>
              {a.description && <p className="text-muted-foreground">{a.description}</p>}
              {a.attachment_url && (
                <a
                  href={a.attachment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline text-xs"
                >
                  <Paperclip className="size-3.5" /> Download attachment (
                  {a.attachment_type ?? "file"})
                </a>
              )}
              {a.submission?.status === "reviewed" && (
                <div className="rounded-lg border p-3 space-y-1 bg-secondary/40">
                  <div className="font-medium">Teacher feedback</div>
                  {a.submission.marks != null && (
                    <div className="text-xs">
                      Marks:{" "}
                      <span className="font-semibold">
                        {a.submission.marks}
                        {a.max_marks ? `/${a.max_marks}` : ""}
                      </span>
                    </div>
                  )}
                  {a.submission.remarks && (
                    <p className="text-xs text-muted-foreground">{a.submission.remarks}</p>
                  )}
                </div>
              )}
              {canEdit && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="text-xs font-medium">Your submission</div>
                  <Input
                    placeholder="Attachment URL (link to your work)"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <Textarea
                    placeholder="Optional note to teacher…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {canEdit && (
                <Button
                  disabled={pending}
                  onClick={() => onSubmit({ homeworkId: a.id, attachment_url: url, note })}
                >
                  <Upload className="size-3.5 mr-1" />
                  {a.submission?.status === "submitted" ? "Resubmit" : "Submit"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

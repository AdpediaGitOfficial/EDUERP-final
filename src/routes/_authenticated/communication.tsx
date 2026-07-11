import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiGet, apiFetch } from "@/lib/api/client";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { Megaphone, Send, Users, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/communication")({
  component: () => (
    <RequireRole roles={["admin", "teacher"]}>
      <Page />
    </RequireRole>
  ),
});

type Audience = "all_parents" | "all_teachers" | "class" | "everyone";

function Page() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const [audience, setAudience] = useState<Audience>("all_parents");
  const [classId, setClassId] = useState<string>("");
  const [sending, setSending] = useState(false);

  const { data: classes } = useQuery({
    queryKey: ["comm-classes"],
    queryFn: () => apiGet<any[]>("/classes"),
  });

  const { data: broadcasts } = useQuery({
    queryKey: ["comm-broadcasts"],
    queryFn: () => apiGet<any[]>("/broadcasts/outbox"),
  });

  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const subject = String(fd.get("subject") || "").trim();
    const body = String(fd.get("body") || "").trim();
    if (!subject || !body) return toast.error("Subject and message are required");
    if (audience === "class" && !classId) return toast.error("Pick a class");
    setSending(true);
    const form = e.currentTarget;
    try {
      const res = await apiFetch("/broadcasts/send", {
        method: "POST",
        body: JSON.stringify({
          audience,
          classId: audience === "class" ? classId : undefined,
          subject,
          body,
        }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Failed to send");
      }
      const out = await res.json();
      toast.success(
        `Broadcast sent to ${out.recipients} recipient${out.recipients === 1 ? "" : "s"}`,
      );
      form.reset();
      qc.invalidateQueries({ queryKey: ["comm-broadcasts"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const statsFor = (b: any) => ({ total: b.recipientCount ?? 0, read: b.readCount ?? 0 });

  return (
    <AppShell>
      <PageHeader
        title="Communication"
        subtitle="Send broadcast messages to parents, teachers or a class."
      />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-6">
        <Card className="rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="size-4" />
            <div className="font-medium">New broadcast</div>
          </div>
          <form onSubmit={send} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_parents">All parents</SelectItem>
                  <SelectItem value="all_teachers">All teachers</SelectItem>
                  <SelectItem value="class">Specific class (parents)</SelectItem>
                  <SelectItem value="everyone">Everyone (parents + teachers)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {audience === "class" && (
              <div className="space-y-1.5">
                <Label>Class</Label>
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a class" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(classes ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.section ? ` ${c.section}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                name="subject"
                required
                maxLength={140}
                placeholder="e.g. Parent-teacher meeting on Friday"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                name="body"
                required
                rows={6}
                maxLength={2000}
                placeholder="Write your message…"
              />
            </div>
            <Button type="submit" disabled={sending} className="w-full">
              <Send className="size-4" /> {sending ? "Sending…" : "Send broadcast"}
            </Button>
          </form>
        </Card>

        <Card className="rounded-2xl overflow-hidden">
          <div className="p-4 border-b font-medium">Sent history</div>
          <ul className="divide-y max-h-[70vh] overflow-y-auto">
            {(broadcasts ?? []).map((b) => {
              const s = statsFor(b);
              return (
                <li key={b.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{b.subject}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(b.created_at), "dd MMM yyyy · HH:mm")} ·{" "}
                        <span className="capitalize">{b.audience_type.replace("_", " ")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="gap-1">
                        <Users className="size-3" />
                        {s.total}
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        <Eye className="size-3" />
                        {s.read}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-3">
                    {b.body}
                  </p>
                </li>
              );
            })}
            {(broadcasts ?? []).length === 0 && (
              <li className="p-8 text-center text-sm text-muted-foreground">No broadcasts yet.</li>
            )}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}

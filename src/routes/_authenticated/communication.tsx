import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
    queryFn: async () =>
      (await supabase.from("classes").select("id,name,section").order("name")).data ?? [],
  });

  const { data: broadcasts } = useQuery({
    queryKey: ["comm-broadcasts"],
    queryFn: async () =>
      (
        await supabase
          .from("broadcasts")
          .select("id,subject,body,audience_type,audience_ref,created_at,sender_id")
          .order("created_at", { ascending: false })
          .limit(50)
      ).data ?? [],
  });

  const { data: recipients } = useQuery({
    queryKey: ["comm-recipients"],
    queryFn: async () =>
      (await supabase.from("broadcast_recipients").select("broadcast_id,read_at")).data ?? [],
  });

  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const subject = String(fd.get("subject") || "").trim();
    const body = String(fd.get("body") || "").trim();
    if (!subject || !body) return toast.error("Subject and message are required");
    setSending(true);
    try {
      // Resolve target users
      let userIds: string[] = [];
      if (audience === "all_parents" || audience === "everyone") {
        const { data } = await supabase.from("user_roles").select("user_id").eq("role", "parent");
        userIds.push(...(data ?? []).map((r) => r.user_id));
      }
      if (audience === "all_teachers" || audience === "everyone") {
        const { data } = await supabase.from("user_roles").select("user_id").eq("role", "teacher");
        userIds.push(...(data ?? []).map((r) => r.user_id));
      }
      if (audience === "class") {
        if (!classId) {
          setSending(false);
          return toast.error("Pick a class");
        }
        const { data: sts } = await supabase.from("students").select("id").eq("class_id", classId);
        const sIds = (sts ?? []).map((s) => s.id);
        if (sIds.length) {
          const { data: ps } = await supabase
            .from("parent_student")
            .select("parent_id")
            .in("student_id", sIds);
          userIds.push(...(ps ?? []).map((r) => r.parent_id));
        }
      }
      userIds = Array.from(new Set(userIds));

      const { data: bc, error } = await supabase
        .from("broadcasts")
        .insert({
          sender_id: user.id,
          subject,
          body,
          audience_type: audience,
          audience_ref: audience === "class" ? classId : null,
        })
        .select("id")
        .single();
      if (error) throw error;

      if (userIds.length) {
        const rows = userIds.map((uid) => ({ broadcast_id: bc.id, user_id: uid }));
        await supabase.from("broadcast_recipients").insert(rows);
      }
      toast.success(
        `Broadcast sent to ${userIds.length} recipient${userIds.length === 1 ? "" : "s"}`,
      );
      (e.target as HTMLFormElement).reset();
      qc.invalidateQueries({ queryKey: ["comm-broadcasts"] });
      qc.invalidateQueries({ queryKey: ["comm-recipients"] });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const statsFor = (bid: string) => {
    const rs = (recipients ?? []).filter((r) => r.broadcast_id === bid);
    return { total: rs.length, read: rs.filter((r) => r.read_at).length };
  };

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
              const s = statsFor(b.id);
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

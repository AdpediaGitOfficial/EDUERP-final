import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useState } from "react";
import { Megaphone, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/announcements")({
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState("all");

  const { data: items } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () =>
      (await supabase.from("announcements").select("*").order("created_at", { ascending: false }))
        .data ?? [],
  });

  const canPost = user?.primaryRole === "admin" || user?.primaryRole === "teacher";

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("announcements").insert({
      title: String(fd.get("title")),
      body: String(fd.get("body")),
      audience: audience as any,
      author_id: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Announcement posted");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["announcements"] });
  };

  return (
    <AppShell>
      <PageHeader
        title="Announcements"
        subtitle="News and notices for the school community."
        action={
          canPost && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" /> Post notice
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New announcement</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Title</Label>
                    <Input name="title" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Message</Label>
                    <Textarea name="body" rows={5} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Audience</Label>
                    <Select value={audience} onValueChange={setAudience}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Everyone</SelectItem>
                        <SelectItem value="teachers">Teachers</SelectItem>
                        <SelectItem value="students">Students</SelectItem>
                        <SelectItem value="parents">Parents</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full">
                    Post
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />
      <div className="space-y-3">
        {(items ?? []).map((a) => (
          <Card key={a.id} className="p-5 rounded-2xl">
            <div className="flex items-start gap-4">
              <div className="size-10 rounded-xl bg-accent text-accent-foreground grid place-items-center shrink-0">
                <Megaphone className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-lg font-semibold">{a.title}</h3>
                  <Badge variant="secondary" className="capitalize">
                    {a.audience}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(a.created_at))} ago
                </p>
                <p className="mt-3 whitespace-pre-wrap">{a.body}</p>
              </div>
            </div>
          </Card>
        ))}
        {(items ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No announcements yet.</p>
        )}
      </div>
    </AppShell>
  );
}

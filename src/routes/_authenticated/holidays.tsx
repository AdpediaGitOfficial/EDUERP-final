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
import { Plus, Palmtree, CalendarDays, GraduationCap, PartyPopper } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/holidays")({
  component: HolidaysPage,
});

const TYPE_META: Record<string, { icon: any; tone: string }> = {
  holiday: { icon: Palmtree, tone: "bg-stat-sky/50 text-stat-sky-foreground" },
  vacation: { icon: Palmtree, tone: "bg-stat-violet/20 text-stat-violet-foreground" },
  exam: { icon: GraduationCap, tone: "bg-stat-coral/20 text-stat-coral-foreground" },
  event: { icon: PartyPopper, tone: "bg-accent text-accent-foreground" },
};

function HolidaysPage() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("holiday");

  const { data: holidays } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () =>
      (await supabase.from("holidays").select("*").order("start_date")).data ?? [],
  });

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("holidays").insert({
      name: String(fd.get("name")),
      description: String(fd.get("description") || ""),
      start_date: String(fd.get("start")),
      end_date: String(fd.get("end") || fd.get("start")),
      type: type as any,
    });
    if (error) return toast.error(error.message);
    toast.success("Holiday added");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["holidays"] });
  };

  const isAdmin = user?.primaryRole === "admin";
  const upcoming = (holidays ?? []).filter((h) => new Date(h.end_date) >= new Date());
  const past = (holidays ?? []).filter((h) => new Date(h.end_date) < new Date());

  return (
    <AppShell>
      <PageHeader
        title="Holidays & Vacations"
        subtitle="School calendar for the year."
        action={
          isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" /> Add holiday
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add to calendar</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input name="name" required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Start</Label>
                      <Input name="start" type="date" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>End</Label>
                      <Input name="end" type="date" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="holiday">Holiday</SelectItem>
                        <SelectItem value="vacation">Vacation</SelectItem>
                        <SelectItem value="exam">Exam</SelectItem>
                        <SelectItem value="event">Event</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Description</Label>
                    <Textarea name="description" rows={3} />
                  </div>
                  <Button type="submit" className="w-full">
                    Save
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      <h2 className="font-display text-lg font-semibold mb-3">Upcoming</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {upcoming.map((h) => (
          <HolidayCard key={h.id} h={h} />
        ))}
        {upcoming.length === 0 && (
          <p className="text-sm text-muted-foreground">No upcoming holidays.</p>
        )}
      </div>

      {past.length > 0 && (
        <>
          <h2 className="font-display text-lg font-semibold mb-3 text-muted-foreground">Past</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
            {past.map((h) => (
              <HolidayCard key={h.id} h={h} />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

function HolidayCard({ h }: { h: any }) {
  const meta = TYPE_META[h.type] ?? TYPE_META.holiday;
  const Icon = meta.icon;
  const same = h.start_date === h.end_date;
  return (
    <Card className="p-5 rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className={`size-10 rounded-xl grid place-items-center ${meta.tone}`}>
          <Icon className="size-5" />
        </div>
        <Badge variant="outline" className="capitalize">
          {h.type}
        </Badge>
      </div>
      <div className="mt-3 font-display text-lg font-semibold">{h.name}</div>
      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
        <CalendarDays className="size-3.5" />
        {same
          ? format(new Date(h.start_date), "MMM d, yyyy")
          : `${format(new Date(h.start_date), "MMM d")} — ${format(new Date(h.end_date), "MMM d, yyyy")}`}
      </div>
      {h.description && <p className="text-sm text-muted-foreground mt-3">{h.description}</p>}
    </Card>
  );
}

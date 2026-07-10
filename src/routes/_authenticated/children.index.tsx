import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { apiFetch, apiGet } from "@/lib/api/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Card } from "@/components/ui/card";
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
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Plus, GraduationCap } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/children/")({
  component: ChildrenPage,
});

function ChildrenPage() {
  const { user } = useCurrentUser();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: children } = useQuery({
    queryKey: ["children", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // GET /students is parent-scoped by the API (students_parent_read).
      const res = await apiGet<{ rows: any[] }>("/students?pageSize=50");
      return res.rows.map((s) => ({
        student_id: s.id,
        students: {
          id: s.id,
          admission_no: s.admissionNo,
          profiles: { full_name: s.fullName, email: s.email },
          classes: s.class ? { name: s.class.name, section: s.class.section } : null,
        },
      }));
    },
  });

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const adm = String(fd.get("adm")).trim();
    try {
      await apiFetch("/students/link-parent", {
        method: "POST",
        body: JSON.stringify({ admissionNo: adm, parentId: user.id }),
      });
    } catch (err) {
      return toast.error(err instanceof Error ? err.message : "Could not link");
    }
    toast.success("Linked to child");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["children"] });
  };

  return (
    <AppShell>
      <PageHeader
        title="My children"
        subtitle="Students linked to your account."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Link a child
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Link a child by admission number</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Admission number</Label>
                  <Input name="adm" required placeholder="ADM-2026-001" />
                </div>
                <Button type="submit" className="w-full">
                  Link
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(children ?? []).map((row: any) => {
          const s = row.students;
          return (
            <Card key={row.student_id} className="p-5 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-xl bg-stat-indigo text-stat-indigo-foreground grid place-items-center">
                  <GraduationCap className="size-5" />
                </div>
                <div>
                  <div className="font-display font-semibold">{s?.profiles?.full_name}</div>
                  <div className="text-xs text-muted-foreground">{s?.admission_no}</div>
                </div>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                {s?.classes
                  ? `${s.classes.name}${s.classes.section ? ` · ${s.classes.section}` : ""}`
                  : "No class yet"}
              </div>
              <div className="mt-4 flex gap-2">
                <Link to="/children/$studentId/report" params={{ studentId: s?.id }}>
                  <Button size="sm">View full report</Button>
                </Link>
                <Link to="/children/$studentId" params={{ studentId: s?.id }}>
                  <Button variant="outline" size="sm">
                    Details
                  </Button>
                </Link>
                <Link to="/fees">
                  <Button variant="outline" size="sm">
                    Fees
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
        {(children ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No children linked yet.</p>
        )}
      </div>
    </AppShell>
  );
}

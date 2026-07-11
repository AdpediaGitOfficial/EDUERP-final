import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useConfirm } from "@/components/confirm-dialog";
import { apiDelete, apiGet, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState } from "react";
import { Link2, Search, Unlink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/parents/mapping")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <MappingPage />
    </RequireRole>
  ),
});

type Issues = {
  unlinkedStudents: {
    id: string;
    admissionNo: string | null;
    rollNo: string | null;
    name: string | null;
    className: string | null;
  }[];
  orphanGuardians: {
    id: string;
    parentId: string;
    studentId: string;
    parentName: string | null;
    studentName: string | null;
  }[];
};

function MappingPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({
    queryKey: ["parent-mapping"],
    queryFn: () => apiGet<Issues>("/parents/mapping"),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["parent-mapping"] });

  const [linkFor, setLinkFor] = useState<{ id: string; name: string | null } | null>(null);

  const removeOrphan = async (parentId: string, studentId: string) => {
    if (
      !(await confirm({
        title: "Remove this guardian link?",
        destructive: true,
        confirmText: "Remove",
      }))
    )
      return;
    try {
      await apiDelete(`/parents/${parentId}/children/${studentId}`);
      toast.success("Link removed.");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Student–Parent Mapping"
        subtitle="Find and fix students with no guardian and orphaned guardian links."
      />

      {isLoading ? (
        <Card className="rounded-2xl p-6 text-sm text-muted-foreground">Loading…</Card>
      ) : (
        <div className="space-y-6">
          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-medium text-sm">
                Students with no guardian ({data?.unlinkedStudents.length ?? 0})
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Student</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Admission #</th>
                    <th className="p-3">Roll #</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.unlinkedStudents ?? []).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="p-3 font-medium">{s.name ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{s.className ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{s.admissionNo ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{s.rollNo ?? "—"}</td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLinkFor({ id: s.id, name: s.name })}
                        >
                          <Link2 className="size-4 mr-1" /> Link parent
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(data?.unlinkedStudents ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">
                        Every student has at least one guardian. 🎉
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="rounded-2xl overflow-hidden">
            <div className="p-4 border-b font-medium text-sm">
              Orphaned guardian links ({data?.orphanGuardians.length ?? 0})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3">Guardian (not a parent account)</th>
                    <th className="p-3">Student</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.orphanGuardians ?? []).map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="p-3">{o.parentName ?? o.parentId.slice(0, 8)}</td>
                      <td className="p-3 text-muted-foreground">{o.studentName ?? "—"}</td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeOrphan(o.parentId, o.studentId)}
                        >
                          <Unlink className="size-4 mr-1" /> Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(data?.orphanGuardians ?? []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-muted-foreground text-sm">
                        No orphaned guardian links. 🎉
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <Dialog open={!!linkFor} onOpenChange={(o) => !o && setLinkFor(null)}>
        {linkFor && (
          <LinkParentDialog
            student={linkFor}
            onLinked={() => {
              setLinkFor(null);
              invalidate();
            }}
          />
        )}
      </Dialog>
    </AppShell>
  );
}

type Match = { id: string; fullName: string; email: string | null; phone: string | null };

function LinkParentDialog({
  student,
  onLinked,
}: {
  student: { id: string; name: string | null };
  onLinked: () => void;
}) {
  const [q, setQ] = useState("");
  const [rel, setRel] = useState("father");
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["parent-search", q],
    queryFn: () => apiGet<{ matches: Match[] }>(`/parents/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });

  const link = async (parentId: string) => {
    setSaving(true);
    try {
      await apiPost(`/parents/${parentId}/children`, {
        studentId: student.id,
        relationshipType: rel,
      });
      toast.success("Parent linked.");
      onLinked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Link a parent to {student.name ?? "student"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Relationship</Label>
          <Select value={rel} onValueChange={setRel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["father", "mother", "guardian", "emergency_contact"].map((r) => (
                <SelectItem key={r} value={r}>
                  {r.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Search existing parent</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, email or mobile…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y rounded-lg border">
          {(data?.matches ?? []).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 p-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{m.fullName}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {m.email ?? "—"} · {m.phone ?? "—"}
                </div>
              </div>
              <Button size="sm" variant="outline" disabled={saving} onClick={() => link(m.id)}>
                Link
              </Button>
            </div>
          ))}
          {q.trim().length >= 2 && (data?.matches ?? []).length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No parents match. Create one from the Parents page first.
            </div>
          )}
          {q.trim().length < 2 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Type at least 2 characters.
            </div>
          )}
        </div>
      </div>
    </DialogContent>
  );
}

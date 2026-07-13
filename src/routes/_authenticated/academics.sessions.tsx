import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { apiGet, apiFetch } from "@/lib/api/client";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import { EmptyRow } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { Plus, Pencil, CheckCircle2, Archive, Copy, Lock } from "lucide-react";
import { fmtDate, niceLabel, type Tone } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/academics/sessions")({ component: Page });

type Session = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  status: string;
  board: string | null;
  curriculum: string | null;
  promotion_locked: boolean;
  students: number;
  sections: number;
};

const STATUS_TONE: Record<string, Tone> = {
  active: "success",
  upcoming: "info",
  archived: "neutral",
  locked: "warning",
};

const EMPTY = {
  name: "",
  start_date: "",
  end_date: "",
  board: "",
  curriculum: "",
  status: "upcoming",
};

function Page() {
  const qc = useQueryClient();
  const {
    data: sessions,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => apiGet<Session[]>("/academics/sessions"),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [cloneOf, setCloneOf] = useState<Session | null>(null);
  const [cloneName, setCloneName] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["academic-sessions"] });

  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        name: form.name,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        board: form.board || undefined,
        curriculum: form.curriculum || undefined,
        status: form.status,
      });
      const res = editing
        ? await apiFetch(`/academics/sessions/${editing.id}`, { method: "PATCH", body })
        : await apiFetch("/academics/sessions", { method: "POST", body });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not save session");
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Session updated" : "Session created");
      setOpen(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const action = useMutation({
    mutationFn: async ({
      path,
      method = "POST",
      body,
    }: {
      path: string;
      method?: string;
      body?: any;
    }) => {
      const res = await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Action failed");
      }
    },
    onSuccess: (_d, v: any) => {
      toast.success(v.ok ?? "Done");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const clone = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/academics/sessions/${cloneOf!.id}/clone`, {
        method: "POST",
        body: JSON.stringify({ name: cloneName }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not clone session");
      }
      return res.json().catch(() => ({}));
    },
    onSuccess: (r: any) => {
      toast.success(`Session cloned (${r?.clonedClasses ?? 0} class-sections copied)`);
      setCloneOf(null);
      setCloneName("");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (s: Session) => {
    setEditing(s);
    setForm({
      name: s.name,
      start_date: s.start_date ? s.start_date.slice(0, 10) : "",
      end_date: s.end_date ? s.end_date.slice(0, 10) : "",
      board: s.board ?? "",
      curriculum: s.curriculum ?? "",
      status: s.status,
    });
    setOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">All Sessions</h2>
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4 mr-1" />
          Add session
        </Button>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-medium">Session</th>
                  <th className="p-3 font-medium">Period</th>
                  <th className="p-3 font-medium">Board / Curriculum</th>
                  <th className="p-3 font-medium text-right">Students</th>
                  <th className="p-3 font-medium text-right">Sections</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(sessions ?? []).map((s) => (
                  <tr
                    key={s.id}
                    className={
                      s.is_current ? "border-t bg-emerald-50/40 dark:bg-emerald-500/10" : "border-t"
                    }
                  >
                    <td className="p-3">
                      <div className="font-medium flex items-center gap-2">
                        {s.name}
                        {s.is_current && <StatusBadge tone="success" label="Current" />}
                        {s.promotion_locked && (
                          <span title="Promotion locked">
                            <Lock className="size-3.5 text-amber-600" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {s.start_date ? fmtDate(s.start_date) : "—"} →{" "}
                      {s.end_date ? fmtDate(s.end_date) : "—"}
                    </td>
                    <td className="p-3">
                      {[s.board, s.curriculum].filter(Boolean).join(" · ") || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-right">{s.students}</td>
                    <td className="p-3 text-right">{s.sections}</td>
                    <td className="p-3">
                      <StatusBadge
                        tone={STATUS_TONE[s.status] ?? "neutral"}
                        label={niceLabel(s.status)}
                      />
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${s.name}`}
                        onClick={() => openEdit(s)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {!s.is_current && s.status !== "archived" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Set ${s.name} current`}
                          title="Set current"
                          onClick={() =>
                            action.mutate({
                              path: `/academics/sessions/${s.id}/set-current`,
                              ok: "Current session updated",
                            } as any)
                          }
                        >
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Clone ${s.name}`}
                        title="Clone to a new year"
                        onClick={() => {
                          setCloneOf(s);
                          setCloneName("");
                        }}
                      >
                        <Copy className="size-4" />
                      </Button>
                      {s.status !== "archived" && !s.is_current && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Archive ${s.name}`}
                          title="Archive"
                          onClick={() =>
                            action.mutate({
                              path: `/academics/sessions/${s.id}/status`,
                              method: "PATCH",
                              body: { status: "archived" },
                              ok: "Session archived",
                            } as any)
                          }
                        >
                          <Archive className="size-4 text-muted-foreground" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {sessions && sessions.length === 0 && (
                  <EmptyRow
                    colSpan={7}
                    title="No sessions yet"
                    hint="Add your first academic session."
                  />
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit session" : "Add session"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <Label>
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.name}
                placeholder="2027-2028"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Start date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label>End date</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Board</Label>
              <Input
                value={form.board}
                placeholder="CBSE / ICSE / IB…"
                onChange={(e) => setForm({ ...form, board: e.target.value })}
              />
            </div>
            <div>
              <Label>Curriculum</Label>
              <Input
                value={form.curriculum}
                onChange={(e) => setForm({ ...form, curriculum: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="locked">Locked</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!form.name || form.name.length < 4}>
              {editing ? "Save changes" : "Create session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone dialog */}
      <Dialog open={!!cloneOf} onOpenChange={(o) => !o && setCloneOf(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Clone {cloneOf?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Creates a new upcoming session and copies this session's class-sections (names,
            capacities, rooms) — without students — so the new year is ready for enrolment.
          </p>
          <div className="mt-2">
            <Label>New session name</Label>
            <Input
              value={cloneName}
              placeholder="2027-2028"
              onChange={(e) => setCloneName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneOf(null)}>
              Cancel
            </Button>
            <Button onClick={() => clone.mutate()} disabled={!cloneName || cloneName.length < 4}>
              Clone session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

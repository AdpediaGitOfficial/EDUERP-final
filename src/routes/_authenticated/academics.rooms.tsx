import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { apiGet, apiFetch } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { Plus, Pencil, Trash2, DoorOpen, Projector, Sparkles } from "lucide-react";
import { niceLabel, type Tone } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/academics/rooms")({ component: Page });

type Room = {
  id: string;
  room_number: string;
  name: string | null;
  capacity: number;
  floor: string | null;
  building: string | null;
  room_type: string;
  is_smart: boolean;
  has_projector: boolean;
  is_active: boolean;
  assignedClasses: number;
  weeklySlots: number;
};

const TYPE_TONE: Record<string, Tone> = {
  classroom: "info",
  lab: "success",
  library: "warning",
  sports: "neutral",
  auditorium: "danger",
  activity: "neutral",
};

const EMPTY = {
  room_number: "",
  name: "",
  capacity: "40",
  floor: "",
  building: "",
  room_type: "classroom",
  is_smart: false,
  has_projector: false,
  is_active: true,
};

function Page() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [form, setForm] = useState<any>(EMPTY);

  const { data: rooms } = useQuery({
    queryKey: ["academic-rooms"],
    queryFn: () => apiGet<Room[]>("/academics/rooms"),
  });

  const filtered = useMemo(
    () =>
      (rooms ?? []).filter((r) => {
        if (typeFilter !== "all" && r.room_type !== typeFilter) return false;
        if (!q) return true;
        const t = q.toLowerCase();
        return (
          r.room_number.toLowerCase().includes(t) ||
          (r.name ?? "").toLowerCase().includes(t) ||
          (r.building ?? "").toLowerCase().includes(t)
        );
      }),
    [rooms, q, typeFilter],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["academic-rooms"] });

  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        room_number: form.room_number,
        name: form.name || undefined,
        capacity: Number(form.capacity) || 40,
        floor: form.floor || undefined,
        building: form.building || undefined,
        room_type: form.room_type,
        is_smart: form.is_smart,
        has_projector: form.has_projector,
        is_active: form.is_active,
      });
      const res = editing
        ? await apiFetch(`/academics/rooms/${editing.id}`, { method: "PATCH", body })
        : await apiFetch("/academics/rooms", { method: "POST", body });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not save room");
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Room updated" : "Room added");
      setOpen(false);
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/academics/rooms/${id}`, { method: "DELETE" });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not delete room");
      }
    },
    onSuccess: () => {
      toast.success("Room deleted");
      invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (r: Room) => {
    setEditing(r);
    setForm({
      room_number: r.room_number,
      name: r.name ?? "",
      capacity: String(r.capacity),
      floor: r.floor ?? "",
      building: r.building ?? "",
      room_type: r.room_type,
      is_smart: r.is_smart,
      has_projector: r.has_projector,
      is_active: r.is_active,
    });
    setOpen(true);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Search rooms…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.keys(TYPE_TONE).map((t) => (
              <SelectItem key={t} value={t}>
                {niceLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4 mr-1" />
          Add room
        </Button>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Room</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Location</th>
                <th className="p-3 font-medium text-right">Capacity</th>
                <th className="p-3 font-medium">Facilities</th>
                <th className="p-3 font-medium text-right">Utilisation</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={r.is_active ? "border-t" : "border-t opacity-50"}>
                  <td className="p-3">
                    <div className="font-medium">{r.room_number}</div>
                    {r.name && <div className="text-xs text-muted-foreground">{r.name}</div>}
                  </td>
                  <td className="p-3">
                    <StatusBadge tone={TYPE_TONE[r.room_type] ?? "neutral"} label={niceLabel(r.room_type)} />
                  </td>
                  <td className="p-3">
                    {[r.building, r.floor].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="p-3 text-right">{r.capacity}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {r.is_smart && (
                        <span title="Smart classroom">
                          <Sparkles className="size-4 text-indigo-600" />
                        </span>
                      )}
                      {r.has_projector && (
                        <span title="Projector">
                          <Projector className="size-4 text-teal-600" />
                        </span>
                      )}
                      {!r.is_smart && !r.has_projector && <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <span className="text-muted-foreground">{r.assignedClasses} cls · {r.weeklySlots} slots</span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" aria-label={`Edit ${r.room_number}`} onClick={() => openEdit(r)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${r.room_number}`}
                      onClick={() => remove.mutate(r.id)}
                    >
                      <Trash2 className="size-4 text-red-600" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <EmptyRow colSpan={7} icon={DoorOpen} title="No rooms found" hint="Add a classroom, lab or other space." />
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit room" : "Add room"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label>
                Room number <span className="text-red-500">*</span>
              </Label>
              <Input value={form.room_number} onChange={(e) => setForm({ ...form, room_number: e.target.value })} />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.room_type} onValueChange={(v) => setForm({ ...form, room_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(TYPE_TONE).map((t) => (
                    <SelectItem key={t} value={t}>
                      {niceLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Capacity</Label>
              <Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            </div>
            <div>
              <Label>Building</Label>
              <Input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} />
            </div>
            <div>
              <Label>Floor</Label>
              <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label>Smart classroom</Label>
              <Switch checked={form.is_smart} onCheckedChange={(v) => setForm({ ...form, is_smart: v })} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label>Projector</Label>
              <Switch checked={form.has_projector} onCheckedChange={(v) => setForm({ ...form, has_projector: v })} />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-lg border px-3 py-2">
              <Label>Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!form.room_number}>
              {editing ? "Save changes" : "Create room"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

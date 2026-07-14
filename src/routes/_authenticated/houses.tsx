import { RequireRole } from "@/components/require-role";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmptyRow } from "@/components/empty-state";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Pencil, Trash2, Home } from "lucide-react";

export const Route = createFileRoute("/_authenticated/houses")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <HousesPage />
    </RequireRole>
  ),
});

type House = { id: string; name: string; color: string | null };

const SWATCHES = [
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#16a34a",
  "#0d9488",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#db2777",
  "#64748b",
];

/** Colored dot + name badge used across the app for a house. */
export function HouseBadge({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={color ? { borderColor: `${color}55`, color, background: `${color}14` } : undefined}
    >
      <span
        className="size-2 rounded-full"
        style={{ background: color ?? "var(--muted-foreground)" }}
      />
      {name}
    </span>
  );
}

/** Inline house allocator for a student row — a badge that opens a house
 *  picker. Used on the admin + teacher rosters; writes are scoped server-side. */
export function HouseCell({
  studentId,
  house,
}: {
  studentId: string;
  house: House | null;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: houses } = useQuery({
    queryKey: ["sis-houses"],
    queryFn: () => apiGet<House[]>("/sis/houses"),
  });
  const set = async (houseId: string | null) => {
    setBusy(true);
    try {
      await apiPatch(`/students/${studentId}/profile/house`, { houseId });
      qc.invalidateQueries({
        predicate: (q) => {
          const k = String((q.queryKey as unknown[])?.[0] ?? "");
          return k.startsWith("students") || k === "sis-profile";
        },
      });
      toast.success(houseId ? "House allocated" : "House cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update house");
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={busy}
          className="outline-none disabled:opacity-50"
          aria-label="Allocate house"
        >
          {house ? (
            <HouseBadge name={house.name} color={house.color} className="cursor-pointer" />
          ) : (
            <span className="inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground">
              + Allocate
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {(houses ?? []).map((h) => (
          <DropdownMenuItem
            key={h.id}
            onSelect={() => set(h.id)}
            className="cursor-pointer gap-2"
          >
            <span
              className="size-2.5 rounded-full"
              style={{ background: h.color ?? "var(--muted-foreground)" }}
            />
            {h.name}
          </DropdownMenuItem>
        ))}
        {house && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => set(null)}
              className="cursor-pointer text-muted-foreground"
            >
              Clear house
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HousesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<House | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(SWATCHES[0]);

  const { data, isLoading } = useQuery({
    queryKey: ["sis-houses"],
    queryFn: () => apiGet<House[]>("/sis/houses"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sis-houses"] });

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), color };
      return editing ? apiPatch(`/sis/houses/${editing.id}`, body) : apiPost("/sis/houses", body);
    },
    onSuccess: () => {
      toast.success(editing ? "House updated." : "House added.");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/sis/houses/${id}`),
    onSuccess: () => {
      toast.success("House deleted.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const openNew = () => {
    setEditing(null);
    setName("");
    setColor(SWATCHES[0]);
    setOpen(true);
  };
  const openEdit = (h: House) => {
    setEditing(h);
    setName(h.name);
    setColor(h.color ?? SWATCHES[0]);
    setOpen(true);
  };
  const onDelete = async (h: House) => {
    if (
      !(await confirm({
        title: "Delete house?",
        description: `${h.name} — students allocated to it must be reassigned first.`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    remove.mutate(h.id);
  };

  const rows = data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Student Houses"
        subtitle="Houses students are allocated to. Teachers and admins allocate students from the class roster."
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" /> Add house
          </Button>
        }
      />

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-muted-foreground text-left">
              <tr>
                <th className="p-3 font-medium w-16">#</th>
                <th className="p-3 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Home className="size-4" /> House
                  </span>
                </th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3" colSpan={3}>
                      <div className="h-5 w-full animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <EmptyRow colSpan={3} title="No houses yet" hint="Add your first house." />
              ) : (
                rows.map((h, i) => (
                  <tr key={h.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    <td className="p-3">
                      <HouseBadge name={h.name} color={h.color} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(h)}
                          aria-label={`Edit ${h.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onDelete(h)}
                          aria-label={`Delete ${h.name}`}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit house" : "Add house"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="house-name">Name</Label>
              <Input
                id="house-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Red House, Phoenix"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) save.mutate();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap items-center gap-2">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setColor(s)}
                    aria-label={`Colour ${s}`}
                    className={cn(
                      "size-7 rounded-full border-2 transition",
                      color === s ? "border-foreground" : "border-transparent",
                    )}
                    style={{ background: s }}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label="Custom colour"
                  className="size-7 cursor-pointer rounded-full border bg-transparent p-0"
                />
              </div>
              <div className="pt-1">
                <HouseBadge name={name.trim() || "Preview"} color={color} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

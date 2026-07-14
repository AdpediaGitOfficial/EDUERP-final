import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { QueryError, TableSkeleton } from "@/components/query-states";
import { useConfirm } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Tags, Power } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finance/fee-types")({
  component: FeeTypesPage,
});

type FeeType = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  isActive: boolean;
};

const CATEGORIES = ["tuition", "admission", "transport", "hostel", "library", "exam", "other"];

function FeeTypesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<FeeType | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "other", description: "" });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["fee-types"],
    queryFn: () => apiGet<FeeType[]>("/fees/types?includeInactive=1"),
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter(
      (t) =>
        !term || t.name.toLowerCase().includes(term) || t.category.toLowerCase().includes(term),
    );
  }, [data, q]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["fee-types"] });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", category: "other", description: "" });
    setOpen(true);
  };
  const openEdit = (t: FeeType) => {
    setEditing(t);
    setForm({ name: t.name, category: t.category, description: t.description ?? "" });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || undefined,
      };
      if (!body.name) throw new Error("Name is required");
      return editing ? apiPatch(`/fees/types/${editing.id}`, body) : apiPost("/fees/types", body);
    },
    onSuccess: () => {
      toast.success(editing ? "Fee type updated" : "Fee type created");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save fee type"),
  });

  const toggleActive = useMutation({
    mutationFn: (t: FeeType) => apiPatch(`/fees/types/${t.id}`, { isActive: !t.isActive }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update"),
  });

  const del = async (t: FeeType) => {
    if (
      !(await confirm({
        title: `Delete "${t.name}"?`,
        description:
          "This removes the fee type from the catalogue. Deactivate it instead if it may be used in a fee group later.",
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    try {
      await apiDelete(`/fees/types/${t.id}`);
      toast.success("Fee type deleted");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem] max-w-xs">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search fee types…"
            className="pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex-1" />
        <Button size="sm" onClick={openNew}>
          <Plus className="size-4 mr-1" /> Add fee type
        </Button>
      </div>

      <Card className="rounded-2xl overflow-hidden">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={6} cols={4} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Tags}
            title="No fee types"
            hint="Add fee heads like Tuition, Transport or Exam to build fee groups from."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{t.name}</td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{t.category}</td>
                    <td className="px-3 py-2 text-muted-foreground">{t.description || "—"}</td>
                    <td className="px-3 py-2">
                      {t.isActive ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0">Active</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 border-0">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => toggleActive.mutate(t)}
                          aria-label={t.isActive ? "Deactivate" : "Activate"}
                          title={t.isActive ? "Deactivate" : "Activate"}
                        >
                          <Power className={`size-4 ${t.isActive ? "text-emerald-600" : ""}`} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(t)}
                          aria-label="Edit"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => del(t)}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit fee type" : "New fee type"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Tuition Fee"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this fee covers"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

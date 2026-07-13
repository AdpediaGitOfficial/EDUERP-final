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
import { useConfirm } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Pencil, Trash2, Tags } from "lucide-react";

export const Route = createFileRoute("/_authenticated/student-categories")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <StudentCategoriesPage />
    </RequireRole>
  ),
});

type Category = { id: string; name: string };

function StudentCategoriesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sis-categories"],
    queryFn: () => apiGet<Category[]>("/sis/categories"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sis-categories"] });

  const save = useMutation({
    mutationFn: () =>
      editing
        ? apiPatch(`/sis/categories/${editing.id}`, { name: name.trim() })
        : apiPost("/sis/categories", { name: name.trim() }),
    onSuccess: () => {
      toast.success(editing ? "Category updated." : "Category added.");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/sis/categories/${id}`),
    onSuccess: () => {
      toast.success("Category deleted.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const openNew = () => {
    setEditing(null);
    setName("");
    setOpen(true);
  };
  const openEdit = (c: Category) => {
    setEditing(c);
    setName(c.name);
    setOpen(true);
  };
  const onDelete = async (c: Category) => {
    if (
      !(await confirm({
        title: "Delete category?",
        description: c.name,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    remove.mutate(c.id);
  };

  const rows = data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Student Categories"
        subtitle="Government reporting categories used across admission and student records."
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" /> Add category
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
                    <Tags className="size-4" /> Name
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
                <EmptyRow colSpan={3} title="No categories yet" hint="Add your first category." />
              ) : (
                rows.map((c, i) => (
                  <tr key={c.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(c)}
                          aria-label={`Edit ${c.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onDelete(c)}
                          aria-label={`Delete ${c.name}`}
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
            <DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. General, SC, ST, OBC"
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) save.mutate();
              }}
            />
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

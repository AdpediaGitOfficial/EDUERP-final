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
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/confirm-dialog";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Pencil, Trash2, ListPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/custom-fields")({
  component: () => (
    <RequireRole roles={["admin"]}>
      <CustomFieldsPage />
    </RequireRole>
  ),
});

type Field = {
  id: string;
  label: string;
  fieldType: string;
  options: string[];
  active: boolean;
  sortOrder: number;
};

function CustomFieldsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Field | null>(null);
  const [form, setForm] = useState({ label: "", fieldType: "text", options: "", sortOrder: 0 });

  const { data, isLoading } = useQuery({
    queryKey: ["sis-custom-fields"],
    queryFn: () => apiGet<Field[]>("/sis/custom-fields?includeInactive=true"),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["sis-custom-fields"] });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        label: form.label.trim(),
        fieldType: form.fieldType,
        options:
          form.fieldType === "dropdown"
            ? form.options
                .split(",")
                .map((o) => o.trim())
                .filter(Boolean)
            : [],
        sortOrder: Number(form.sortOrder) || 0,
      };
      return editing
        ? apiPatch(`/sis/custom-fields/${editing.id}`, payload)
        : apiPost("/sis/custom-fields", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Field updated." : "Field added.");
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const toggleActive = useMutation({
    mutationFn: (f: Field) => apiPatch(`/sis/custom-fields/${f.id}`, { active: !f.active }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/sis/custom-fields/${id}`),
    onSuccess: () => {
      toast.success("Field deleted.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ label: "", fieldType: "text", options: "", sortOrder: 0 });
    setOpen(true);
  };
  const openEdit = (f: Field) => {
    setEditing(f);
    setForm({
      label: f.label,
      fieldType: f.fieldType,
      options: f.options.join(", "),
      sortOrder: f.sortOrder,
    });
    setOpen(true);
  };
  const onDelete = async (f: Field) => {
    if (
      !(await confirm({
        title: "Delete custom field?",
        description: f.label,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    remove.mutate(f.id);
  };

  const rows = data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Custom Fields"
        subtitle="Extra admission-form fields (shown in the wizard's Additional Details step) stored against each student."
        action={
          <Button onClick={openNew}>
            <Plus className="size-4" /> Add field
          </Button>
        }
      />

      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-secondary text-muted-foreground text-left">
              <tr>
                <th className="p-3 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <ListPlus className="size-4" /> Label
                  </span>
                </th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Options</th>
                <th className="p-3 font-medium">Active</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-3" colSpan={5}>
                      <div className="h-5 w-full animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <EmptyRow
                  colSpan={5}
                  title="No custom fields"
                  hint="Add extra admission-form fields here."
                />
              ) : (
                rows.map((f) => (
                  <tr key={f.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{f.label}</td>
                    <td className="p-3 capitalize text-muted-foreground">{f.fieldType}</td>
                    <td className="p-3 text-muted-foreground">
                      {f.fieldType === "dropdown" ? (
                        <div className="flex flex-wrap gap-1">
                          {f.options.map((o) => (
                            <Badge key={o} variant="secondary">
                              {o}
                            </Badge>
                          ))}
                          {f.options.length === 0 && "—"}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-3">
                      <Switch
                        checked={f.active}
                        onCheckedChange={() => toggleActive.mutate(f)}
                        aria-label={`Toggle ${f.label}`}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(f)}
                          aria-label={`Edit ${f.label}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onDelete(f)}
                          aria-label={`Delete ${f.label}`}
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
            <DialogTitle>{editing ? "Edit field" : "Add custom field"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cf-label">Label</Label>
              <Input
                id="cf-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Transport Zone"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-type">Type</Label>
              <Select
                value={form.fieldType}
                onValueChange={(v) => setForm((f) => ({ ...f, fieldType: v }))}
              >
                <SelectTrigger id="cf-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="dropdown">Dropdown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.fieldType === "dropdown" && (
              <div className="space-y-1.5">
                <Label htmlFor="cf-options">Options (comma-separated)</Label>
                <Input
                  id="cf-options"
                  value={form.options}
                  onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
                  placeholder="North, South, East, West"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="cf-order">Sort order</Label>
              <Input
                id="cf-order"
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!form.label.trim() || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

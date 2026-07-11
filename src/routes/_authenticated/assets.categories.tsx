import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { useConfirm } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, FolderTree } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/assets-util";

export const Route = createFileRoute("/_authenticated/assets/categories")({
  component: Categories,
});

function Categories() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    description: string | null;
  } | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["assets-cats-full"],
    queryFn: () =>
      apiGet<
        {
          id: string;
          name: string;
          description: string | null;
          assetCount: number;
          totalValue: number;
        }[]
      >("/assets/categories"),
  });

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || ""),
      description: String(fd.get("description") || "") || null,
    };
    const res = editing
      ? await apiFetch(`/assets/categories/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await apiFetch("/assets/categories", { method: "POST", body: JSON.stringify(payload) });
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      return toast.error(body?.message ?? "Could not save category");
    }
    toast.success(editing ? "Category updated" : "Category added");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["assets-cats-full"] });
  };

  const del = async (id: string, name: string) => {
    if (
      !(await confirm({
        title: `Delete "${name}"?`,
        description:
          "Assets in this category keep their name but lose the category link. This can't be undone.",
        confirmText: "Delete category",
        destructive: true,
      }))
    )
      return;
    const res = await apiFetch(`/assets/categories/${id}`, { method: "DELETE" });
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      return toast.error(body?.message ?? "Could not delete");
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["assets-cats-full"] });
  };

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Group assets to see counts and total book value per category."
        action={
          <Dialog
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) setEditing(null);
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> New category
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit" : "Add"} category</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input name="name" defaultValue={editing?.name ?? ""} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input name="description" defaultValue={editing?.description ?? ""} />
                </div>
                <Button type="submit" className="w-full">
                  Save
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(categories ?? []).map((c) => {
          const s = { count: c.assetCount, value: c.totalValue };
          return (
            <Card key={c.id} className="p-5 rounded-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                    <FolderTree className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.description ?? "—"}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit category ${c.name}`}
                    onClick={() => {
                      setEditing({ id: c.id, name: c.name, description: c.description });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete category ${c.name}`}
                    onClick={() => del(c.id, c.name)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Assets</div>
                  <div className="font-semibold">{s.count}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Value</div>
                  <div className="font-semibold">{formatMoney(s.value)}</div>
                </div>
              </div>
              <Link
                to="/assets/registry"
                search={{ category: c.id }}
                className="mt-4 inline-block text-sm text-primary hover:underline"
              >
                View assets →
              </Link>
            </Card>
          );
        })}
        {(categories ?? []).length === 0 && (
          <Card className="p-8 rounded-2xl text-center text-muted-foreground col-span-full">
            No categories yet.
          </Card>
        )}
      </div>
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
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
import { Plus, Pencil, Building2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/assets-util";

export const Route = createFileRoute("/_authenticated/assets/vendors")({
  component: Vendors,
});

function Vendors() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);

  const { data: vendors } = useQuery({
    queryKey: ["assets-vendors-full"],
    queryFn: () =>
      apiGet<
        {
          id: string;
          name: string;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          category_hint: string | null;
          assetCount: number;
          amcCount: number;
          assets: { id: string; name: string; purchase_price: number | null }[];
          amcs: {
            id: string;
            assetName: string | null;
            end_date: string | null;
            coverage: string | null;
          }[];
        }[]
      >("/assets/vendors"),
  });

  const selected = vendors?.find((v) => v.id === selectedId) ?? null;
  const vendorAssets = selected?.assets ?? [];
  const vendorAmcs = selected?.amcs ?? [];

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || ""),
      contact_name: String(fd.get("contact_name") || "") || null,
      email: String(fd.get("email") || "") || null,
      phone: String(fd.get("phone") || "") || null,
      category_hint: String(fd.get("category_hint") || "") || null,
    };
    const res = editing
      ? await apiFetch(`/assets/vendors/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        })
      : await apiFetch("/assets/vendors", { method: "POST", body: JSON.stringify(payload) });
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      return toast.error(body?.message ?? "Could not save vendor");
    }
    toast.success(editing ? "Vendor updated" : "Vendor added");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["assets-vendors-full"] });
  };

  return (
    <>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers and AMC providers."
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
                <Plus className="size-4" /> New vendor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit" : "Add"} vendor</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input name="name" defaultValue={editing?.name ?? ""} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Contact name</Label>
                    <Input name="contact_name" defaultValue={editing?.contact_name ?? ""} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Input name="category_hint" defaultValue={editing?.category_hint ?? ""} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input name="email" type="email" defaultValue={editing?.email ?? ""} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input name="phone" defaultValue={editing?.phone ?? ""} />
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  Save
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          {(vendors ?? []).map((v) => {
            const s = { assetCount: v.assetCount, amcCount: v.amcCount };
            return (
              <Card
                key={v.id}
                className={`p-4 rounded-2xl cursor-pointer transition ${selectedId === v.id ? "ring-2 ring-primary" : "hover:bg-muted/40"}`}
                onClick={() => setSelectedId(v.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                    <Building2 className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium truncate">{v.name}</div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(v);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {v.contact_name ?? "—"} · {v.email ?? ""} {v.phone ? `· ${v.phone}` : ""}
                    </div>
                    <div className="mt-2 text-xs flex gap-4">
                      <span>
                        <span className="font-semibold">{s.assetCount}</span> assets
                      </span>
                      <span>
                        <span className="font-semibold">{s.amcCount}</span> AMC contracts
                      </span>
                      <span className="text-muted-foreground">{v.category_hint ?? ""}</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {(vendors ?? []).length === 0 && (
            <Card className="p-8 rounded-2xl text-center text-muted-foreground">
              No vendors yet.
            </Card>
          )}
        </div>

        <Card className="p-5 rounded-2xl h-fit">
          <div className="text-sm font-medium mb-3">
            {selected ? selected.name : "Vendor details"}
          </div>
          {!selected ? (
            <div className="text-sm text-muted-foreground">
              Select a vendor to view purchase history and AMC contracts.
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-1">
                Purchases ({vendorAssets.length})
              </div>
              <ul className="space-y-1 mb-4 text-sm">
                {vendorAssets.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 border-b py-1">
                    <span className="truncate">{a.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {formatMoney(a.purchase_price)}
                    </span>
                  </li>
                ))}
                {vendorAssets.length === 0 && <li className="text-muted-foreground">None</li>}
              </ul>
              <div className="text-xs text-muted-foreground mb-1">
                Active AMC ({vendorAmcs.length})
              </div>
              <ul className="space-y-1 text-sm">
                {vendorAmcs.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 border-b py-1">
                    <span className="truncate">{a.assetName}</span>
                    <span className="text-muted-foreground shrink-0">
                      {a.end_date ? `exp ${new Date(a.end_date).toLocaleDateString()}` : "—"}
                    </span>
                  </li>
                ))}
                {vendorAmcs.length === 0 && <li className="text-muted-foreground">None</li>}
              </ul>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

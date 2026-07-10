import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { STATUS_CLASS, STATUS_LABEL, formatMoney, nextAssetCode } from "@/lib/assets-util";

type SearchParams = { category?: string; status?: string };

export const Route = createFileRoute("/_authenticated/assets/registry")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    category: typeof s.category === "string" ? s.category : undefined,
    status: typeof s.status === "string" ? s.status : undefined,
  }),
  component: Registry,
});

function Registry() {
  const search = useSearch({ from: "/_authenticated/assets/registry" });
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(search.status ?? "all");
  const [categoryId, setCategoryId] = useState<string>(search.category ?? "all");
  const [location, setLocation] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const { data: assets } = useQuery({
    queryKey: ["assets-registry"],
    queryFn: async () =>
      (await supabase.from("assets").select("*, asset_categories(name)").order("asset_code"))
        .data ?? [],
  });
  const { data: categories } = useQuery({
    queryKey: ["assets-cats"],
    queryFn: async () =>
      (await supabase.from("asset_categories").select("id,name").order("name")).data ?? [],
  });
  const { data: vendors } = useQuery({
    queryKey: ["assets-vendors"],
    queryFn: async () =>
      (await supabase.from("asset_vendors").select("id,name").order("name")).data ?? [],
  });

  const locations = useMemo(() => {
    const s = new Set<string>();
    for (const a of assets ?? []) if (a.location) s.add(a.location);
    return [...s].sort();
  }, [assets]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (assets ?? []).filter((a: any) => {
      if (
        t &&
        !(
          (a.name || "").toLowerCase().includes(t) || (a.asset_code || "").toLowerCase().includes(t)
        )
      )
        return false;
      if (status !== "all" && a.status !== status) return false;
      if (categoryId !== "all" && a.category_id !== categoryId) return false;
      if (location !== "all" && a.location !== location) return false;
      return true;
    });
  }, [assets, q, status, categoryId, location]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const price = Number(fd.get("purchase_price") || 0);
    const code = nextAssetCode((assets ?? []).map((a: any) => a.asset_code).filter(Boolean));
    const payload = {
      name: String(fd.get("name") || ""),
      category_id: String(fd.get("category_id") || "") || null,
      category: categories?.find((c) => c.id === fd.get("category_id"))?.name ?? null,
      vendor_id: String(fd.get("vendor_id") || "") || null,
      purchase_date: String(fd.get("purchase_date") || "") || null,
      purchase_price: price || null,
      current_value: price || null,
      warranty_expiry: String(fd.get("warranty_expiry") || "") || null,
      useful_life_years: Number(fd.get("useful_life_years") || 5),
      invoice_ref: String(fd.get("invoice_ref") || "") || null,
      location: String(fd.get("location") || "") || null,
      status: String(fd.get("status") || "available"),
      condition: "good",
      asset_code: code,
      qr_value: code,
      barcode_value: String(fd.get("barcode_value") || code),
    };
    const { error } = await supabase.from("assets").insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success(`Asset ${code} added`);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["assets-registry"] });
  };

  return (
    <>
      <PageHeader
        title="Asset Registry"
        subtitle={`${filtered.length} of ${(assets ?? []).length} assets`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Add asset
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add asset</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input name="name" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select name="category_id">
                      <SelectTrigger>
                        <SelectValue placeholder="Choose…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(categories ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vendor</Label>
                    <Select name="vendor_id">
                      <SelectTrigger>
                        <SelectValue placeholder="Choose…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(vendors ?? []).map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Purchase date</Label>
                    <Input name="purchase_date" type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Purchase price</Label>
                    <Input name="purchase_price" type="number" step="0.01" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Warranty expiry</Label>
                    <Input name="warranty_expiry" type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Useful life (yrs)</Label>
                    <Input name="useful_life_years" type="number" defaultValue={5} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Invoice ref</Label>
                    <Input name="invoice_ref" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Location</Label>
                    <Input name="location" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Barcode</Label>
                    <Input name="barcode_value" placeholder="auto" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select name="status" defaultValue="available">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Available</SelectItem>
                        <SelectItem value="in_use">In Use</SelectItem>
                        <SelectItem value="repair">In Repair</SelectItem>
                        <SelectItem value="retired">Retired</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  Save asset
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="p-4 rounded-2xl mb-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or ID…"
            className="pl-9"
          />
        </div>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Card className="rounded-2xl overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Status</th>
                <th className="p-3">Assigned / Location</th>
                <th className="p-3">Purchase</th>
                <th className="p-3 text-right">Current value</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a: any) => (
                <tr key={a.id} className="border-t hover:bg-muted/40">
                  <td className="p-3 font-mono text-xs">
                    <Link
                      to="/assets/detail/$assetId"
                      params={{ assetId: a.id }}
                      className="text-primary hover:underline"
                    >
                      {a.asset_code}
                    </Link>
                  </td>
                  <td className="p-3 font-medium">{a.name}</td>
                  <td className="p-3">{a.asset_categories?.name ?? a.category ?? "—"}</td>
                  <td className="p-3">
                    <Badge className={`${STATUS_CLASS[a.status] ?? ""} border capitalize`}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </Badge>
                  </td>
                  <td className="p-3">{a.assigned_to_label || a.location || "—"}</td>
                  <td className="p-3">
                    {a.purchase_date ? new Date(a.purchase_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3 text-right">{formatMoney(a.current_value)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No assets match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Mobile stacked */}
        <div className="md:hidden divide-y">
          {filtered.map((a: any) => (
            <Link
              key={a.id}
              to="/assets/detail/$assetId"
              params={{ assetId: a.id }}
              className="block p-4 hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{a.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{a.asset_code}</div>
                </div>
                <Badge className={`${STATUS_CLASS[a.status] ?? ""} border shrink-0`}>
                  {STATUS_LABEL[a.status]}
                </Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
                <span>
                  {a.asset_categories?.name ?? a.category ?? "—"} ·{" "}
                  {a.assigned_to_label || a.location || "—"}
                </span>
                <span>{formatMoney(a.current_value)}</span>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">No assets match.</div>
          )}
        </div>
      </Card>
    </>
  );
}

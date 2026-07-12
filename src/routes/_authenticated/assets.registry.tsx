import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { DataTable, type Column } from "@/components/data-table";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
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
import { Package, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { STATUS_LABEL, formatMoney } from "@/lib/assets-util";

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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(search.status ?? "all");
  const [categoryId, setCategoryId] = useState<string>(search.category ?? "all");
  const [location, setLocation] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const { data: assets } = useQuery({
    queryKey: ["assets-registry"],
    queryFn: () =>
      apiGet<
        {
          id: string;
          name: string;
          asset_code: string | null;
          category_id: string | null;
          category: string | null;
          categoryName: string | null;
          status: string;
          condition: string;
          location: string | null;
          assigned_to_label: string | null;
          purchase_date: string | null;
          purchase_price: number | null;
          current_value: number | null;
        }[]
      >("/assets"),
  });
  const { data: categories } = useQuery({
    queryKey: ["assets-cats"],
    queryFn: () => apiGet<{ id: string; name: string }[]>("/assets/categories"),
  });
  const { data: vendors } = useQuery({
    queryKey: ["assets-vendors"],
    queryFn: () => apiGet<{ id: string; name: string }[]>("/assets/vendors"),
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
    const payload = {
      name: String(fd.get("name") || ""),
      category_id: String(fd.get("category_id") || "") || null,
      vendor_id: String(fd.get("vendor_id") || "") || null,
      purchase_date: String(fd.get("purchase_date") || "") || null,
      purchase_price: price || null,
      current_value: price || null,
      warranty_expiry: String(fd.get("warranty_expiry") || "") || null,
      useful_life_years: Number(fd.get("useful_life_years") || 5),
      invoice_ref: String(fd.get("invoice_ref") || "") || null,
      location: String(fd.get("location") || "") || null,
      status: String(fd.get("status") || "available"),
      barcode_value: String(fd.get("barcode_value") || "") || null,
    };
    const res = await apiFetch("/assets", { method: "POST", body: JSON.stringify(payload) });
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      return toast.error(body?.message ?? "Could not add asset");
    }
    const created = await res.json().catch(() => null);
    toast.success(`Asset ${created?.asset_code ?? ""} added`.trim());
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["assets-registry"] });
  };

  const columns: Column<any>[] = [
    {
      id: "asset_code",
      header: "ID",
      sortValue: (a) => a.asset_code ?? "",
      cell: (a) => <span className="font-mono text-xs text-primary">{a.asset_code}</span>,
    },
    {
      id: "name",
      header: "Name",
      sortValue: (a) => a.name ?? "",
      cell: (a) => <span className="font-medium">{a.name}</span>,
    },
    {
      id: "category",
      header: "Category",
      sortValue: (a) => a.categoryName ?? "",
      cell: (a) => a.categoryName ?? "—",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (a) => a.status ?? "",
      cell: (a) => <StatusBadge status={a.status} label={STATUS_LABEL[a.status]} />,
    },
    {
      id: "location",
      header: "Assigned / Location",
      cell: (a) => a.assigned_to_label || a.location || "—",
    },
    {
      id: "purchase",
      header: "Purchase",
      sortValue: (a) => a.purchase_date ?? "",
      cell: (a) => (a.purchase_date ? new Date(a.purchase_date).toLocaleDateString() : "—"),
    },
    {
      id: "value",
      header: "Current value",
      align: "right",
      sortValue: (a) => a.current_value ?? 0,
      cell: (a) => formatMoney(a.current_value),
    },
  ];

  const openAsset = (a: any) =>
    navigate({ to: "/assets/detail/$assetId", params: { assetId: a.id } });

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

      <DataTable
        rows={assets === undefined ? undefined : filtered}
        columns={columns}
        getRowId={(a) => a.id}
        loading={assets === undefined}
        onRowClick={openAsset}
        initialSort={{ id: "name", dir: "asc" }}
        emptyIcon={Package}
        emptyTitle="No assets match"
        emptyHint="Try a different search, category, or status filter."
        renderMobileCard={(a) => (
          <button
            type="button"
            onClick={() => openAsset(a)}
            className="block w-full text-left p-4 hover:bg-muted/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{a.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{a.asset_code}</div>
              </div>
              <StatusBadge status={a.status} label={STATUS_LABEL[a.status]} className="shrink-0" />
            </div>
            <div className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
              <span>
                {a.categoryName ?? "—"} · {a.assigned_to_label || a.location || "—"}
              </span>
              <span>{formatMoney(a.current_value)}</span>
            </div>
          </button>
        )}
      />
    </>
  );
}

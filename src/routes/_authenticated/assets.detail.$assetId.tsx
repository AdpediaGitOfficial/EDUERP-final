import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiFetch } from "@/lib/api/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import Barcode from "react-barcode";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  formatMoney,
  depreciationSeries,
  daysBetween,
  computeCurrentValue,
} from "@/lib/assets-util";
import { toast } from "sonner";
import { ArrowLeft, Wrench, ShieldCheck, ClipboardList, CalendarClock } from "lucide-react";

type AssetDetailData = {
  id: string;
  name: string;
  asset_code: string | null;
  status: string;
  condition: string;
  category: string | null;
  categoryName: string | null;
  vendorName: string | null;
  location: string | null;
  assigned_to_label: string | null;
  notes: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  current_value: number | null;
  warranty_expiry: string | null;
  useful_life_years: number | null;
  invoice_ref: string | null;
  qr_value: string;
  barcode_value: string;
};

export const Route = createFileRoute("/_authenticated/assets/detail/$assetId")({
  component: AssetDetail,
});

function AssetDetail() {
  const { assetId } = Route.useParams();
  const qc = useQueryClient();

  const { data: asset } = useQuery({
    queryKey: ["asset", assetId],
    queryFn: () => apiGet<AssetDetailData>(`/assets/${assetId}`),
  });
  const { data: allocations } = useQuery({
    queryKey: ["asset-allocs", assetId],
    queryFn: () =>
      apiGet<
        {
          id: string;
          assignee_label: string;
          allocated_at: string | null;
          returned_at: string | null;
          return_condition: string | null;
        }[]
      >(`/assets/${assetId}/allocations`),
  });
  const { data: maintenance } = useQuery({
    queryKey: ["asset-maints", assetId],
    queryFn: () =>
      apiGet<
        {
          id: string;
          type: string;
          performed_by: string | null;
          cost: number | null;
          completed_at: string | null;
          scheduled_for: string | null;
        }[]
      >(`/assets/${assetId}/maintenance`),
  });
  const { data: amcs } = useQuery({
    queryKey: ["asset-amcs", assetId],
    queryFn: () =>
      apiGet<
        {
          id: string;
          vendorName: string | null;
          coverage: string | null;
          end_date: string | null;
        }[]
      >(`/assets/${assetId}/amc`),
  });

  if (!asset) return <div className="text-muted-foreground">Loading…</div>;

  const price = Number(asset.purchase_price ?? 0);
  const life = asset.useful_life_years ?? 5;
  const series =
    asset.purchase_date && price ? depreciationSeries(price, asset.purchase_date, life) : [];
  const currentValue =
    asset.purchase_date && price
      ? computeCurrentValue(price, asset.purchase_date, life)
      : Number(asset.current_value ?? 0);

  const warrantyDays = asset.warranty_expiry
    ? daysBetween(new Date(), asset.warranty_expiry)
    : null;
  const underWarranty = warrantyDays !== null && warrantyDays >= 0;

  const logMaintenance = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const res = await apiFetch("/assets/maintenance", {
      method: "POST",
      body: JSON.stringify({
        assetId,
        completedAt: String(fd.get("completed_at") || "") || null,
        type: String(fd.get("type") || "general"),
        cost: Number(fd.get("cost") || 0),
        performedBy: String(fd.get("performed_by") || "") || null,
        notes: String(fd.get("notes") || "") || null,
        status: "completed",
      }),
    });
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => null) : null;
      return toast.error(body?.message ?? "Could not log maintenance");
    }
    toast.success("Maintenance logged");
    form.reset();
    qc.invalidateQueries({ queryKey: ["asset-maints", assetId] });
  };

  return (
    <>
      <div className="mb-4">
        <Link
          to="/assets/registry"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-4" /> Back to registry
        </Link>
      </div>
      <PageHeader
        title={asset.name}
        subtitle={asset.asset_code ?? undefined}
        action={
          <Badge className={`${STATUS_CLASS[asset.status] ?? ""} border`}>
            {STATUS_LABEL[asset.status] ?? asset.status}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-5 rounded-2xl flex flex-col items-center gap-2">
          <div className="text-xs text-muted-foreground">QR</div>
          <div className="bg-white p-2 rounded-lg">
            <QRCodeSVG value={asset.qr_value} size={140} />
          </div>
          <div className="text-xs font-mono text-muted-foreground">{asset.qr_value}</div>
        </Card>
        <Card className="p-5 rounded-2xl flex flex-col items-center gap-2 lg:col-span-2">
          <div className="text-xs text-muted-foreground">Barcode</div>
          <div className="bg-white p-2 rounded-lg overflow-x-auto max-w-full">
            <Barcode value={asset.barcode_value} height={60} fontSize={12} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 rounded-2xl">
          <div className="text-sm font-medium mb-3">Overview</div>
          <dl className="text-sm grid grid-cols-2 gap-y-2">
            <dt className="text-muted-foreground">Category</dt>
            <dd>{asset.categoryName ?? "—"}</dd>
            <dt className="text-muted-foreground">Location</dt>
            <dd>{asset.location ?? "—"}</dd>
            <dt className="text-muted-foreground">Assigned to</dt>
            <dd>{asset.assigned_to_label ?? "—"}</dd>
            <dt className="text-muted-foreground">Condition</dt>
            <dd className="capitalize">{asset.condition}</dd>
            <dt className="text-muted-foreground">Notes</dt>
            <dd>{asset.notes ?? "—"}</dd>
          </dl>
        </Card>

        <Card className="p-5 rounded-2xl">
          <div className="text-sm font-medium mb-3">Purchase & Warranty</div>
          <dl className="text-sm grid grid-cols-2 gap-y-2">
            <dt className="text-muted-foreground">Purchase date</dt>
            <dd>
              {asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : "—"}
            </dd>
            <dt className="text-muted-foreground">Purchase price</dt>
            <dd>{formatMoney(asset.purchase_price)}</dd>
            <dt className="text-muted-foreground">Vendor</dt>
            <dd>{asset.vendorName ?? "—"}</dd>
            <dt className="text-muted-foreground">Invoice ref</dt>
            <dd className="font-mono text-xs">{asset.invoice_ref ?? "—"}</dd>
            <dt className="text-muted-foreground">Warranty expiry</dt>
            <dd>
              {asset.warranty_expiry ? (
                <>
                  <span>{new Date(asset.warranty_expiry).toLocaleDateString()}</span>{" "}
                  <Badge
                    className={
                      underWarranty
                        ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                        : "bg-red-100 text-red-900 border border-red-200"
                    }
                  >
                    {underWarranty ? "Under warranty" : "Expired"}
                  </Badge>
                </>
              ) : (
                "—"
              )}
            </dd>
          </dl>
        </Card>

        <Card className="p-5 rounded-2xl">
          <div className="flex items-center gap-2 text-sm font-medium mb-3">
            <ClipboardList className="size-4 text-muted-foreground" /> Allocation history
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-1.5">Assignee</th>
                  <th className="text-left p-1.5">From</th>
                  <th className="text-left p-1.5">To</th>
                  <th className="text-left p-1.5">Condition</th>
                </tr>
              </thead>
              <tbody>
                {(allocations ?? []).map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="p-1.5">{a.assignee_label}</td>
                    <td className="p-1.5">
                      {a.allocated_at ? new Date(a.allocated_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-1.5">
                      {a.returned_at ? (
                        new Date(a.returned_at).toLocaleDateString()
                      ) : (
                        <span className="text-emerald-600">Active</span>
                      )}
                    </td>
                    <td className="p-1.5">{a.return_condition ?? "—"}</td>
                  </tr>
                ))}
                {(allocations ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      No allocations.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Wrench className="size-4 text-muted-foreground" /> Maintenance
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  Log
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Log maintenance</DialogTitle>
                </DialogHeader>
                <form onSubmit={logMaintenance} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Date</Label>
                      <Input
                        name="completed_at"
                        type="date"
                        defaultValue={new Date().toISOString().slice(0, 10)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cost</Label>
                      <Input name="cost" type="number" step="0.01" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <Input name="type" defaultValue="preventive" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Performed by</Label>
                      <Input name="performed_by" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Input name="notes" />
                  </div>
                  <Button type="submit" className="w-full">
                    Save
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-1.5">Date</th>
                  <th className="text-left p-1.5">Type</th>
                  <th className="text-left p-1.5">By</th>
                  <th className="text-right p-1.5">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(maintenance ?? []).map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-1.5">
                      {m.completed_at ? (
                        new Date(m.completed_at).toLocaleDateString()
                      ) : (
                        <span className="text-amber-600 inline-flex items-center gap-1">
                          <CalendarClock className="size-3" />
                          {m.scheduled_for ? new Date(m.scheduled_for).toLocaleDateString() : "—"}
                        </span>
                      )}
                    </td>
                    <td className="p-1.5 capitalize">{m.type}</td>
                    <td className="p-1.5">{m.performed_by ?? "—"}</td>
                    <td className="p-1.5 text-right">{formatMoney(m.cost)}</td>
                  </tr>
                ))}
                {(maintenance ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      No records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5 rounded-2xl">
          <div className="flex items-center gap-2 text-sm font-medium mb-3">
            <ShieldCheck className="size-4 text-muted-foreground" /> AMC contracts
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-1.5">Vendor</th>
                  <th className="text-left p-1.5">Coverage</th>
                  <th className="text-left p-1.5">Ends</th>
                  <th className="text-left p-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {(amcs ?? []).map((a) => {
                  const days = a.end_date ? daysBetween(new Date(), a.end_date) : 0;
                  const dueSoon = days >= 0 && days <= 30;
                  const expired = days < 0;
                  return (
                    <tr key={a.id} className="border-t">
                      <td className="p-1.5">{a.vendorName ?? "—"}</td>
                      <td className="p-1.5">{a.coverage ?? "—"}</td>
                      <td className="p-1.5">
                        {a.end_date ? new Date(a.end_date).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-1.5">
                        {expired ? (
                          <Badge className="bg-red-100 text-red-900 border border-red-200">
                            Expired
                          </Badge>
                        ) : dueSoon ? (
                          <Badge className="bg-amber-100 text-amber-900 border border-amber-200">
                            Due · {days}d
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-900 border border-emerald-200">
                            Active
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(amcs ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      No AMC.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5 rounded-2xl lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Depreciation (straight-line, {life} yrs)</div>
            <div className="text-sm">
              Current book value: <span className="font-semibold">{formatMoney(currentValue)}</span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </>
  );
}

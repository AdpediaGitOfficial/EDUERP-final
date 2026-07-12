import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { apiGet, apiFetch } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { EmptyState } from "@/components/empty-state";
import { Plus, Pencil, Trash2, Wallet, X } from "lucide-react";
import { money } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/hr/salary")({ component: Page });

// ── Types ────────────────────────────────────────────────────────────────────
type LineItem = { label: string; amount: number };
type Components = {
  basic: number;
  earnings: LineItem[];
  deductions: LineItem[];
  pf_enabled: boolean;
  esi_enabled: boolean;
  pt_enabled: boolean;
  tds_enabled: boolean;
  tds_amount: number;
};
type Template = Components & {
  id: string;
  name: string;
  code: string;
  description: string | null;
  breakdown: Breakdown;
};
type Breakdown = {
  basic: number;
  earnings: LineItem[];
  deductions: LineItem[];
  gross: number;
  statutory: { pf: number; esi: number; pt: number; tds: number };
  otherDeductions: number;
  totalDeductions: number;
  net: number;
  annualCtc: number;
};
type StaffRow = { id: string; full_name: string; employee_code: string; department: string };
type EmployeeSalary = {
  structure:
    | (Components & { effective_from: string; notes: string | null; template?: { name: string; code: string } | null })
    | null;
  breakdown: Breakdown | null;
};

// Mirror of the server's statutory maths so the editor can preview net pay live.
const PF_RATE = 0.12;
const ESI_RATE = 0.0075;
const ESI_CEILING = 21000;
const PT_FLAT = 200;
const round2 = (n: number) => Math.round(n * 100) / 100;
function preview(c: Components): Breakdown {
  const basic = Math.max(0, Number(c.basic) || 0);
  const earnings = c.earnings.filter((e) => e.label.trim());
  const deductions = c.deductions.filter((d) => d.label.trim());
  const gross = round2(basic + earnings.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const pf = c.pf_enabled ? round2(basic * PF_RATE) : 0;
  const esi = c.esi_enabled && gross <= ESI_CEILING ? round2(gross * ESI_RATE) : 0;
  const pt = c.pt_enabled ? PT_FLAT : 0;
  const tds = c.tds_enabled ? Math.max(0, Number(c.tds_amount) || 0) : 0;
  const otherDeductions = round2(deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0));
  const totalDeductions = round2(pf + esi + pt + tds + otherDeductions);
  return {
    basic,
    earnings,
    deductions,
    gross,
    statutory: { pf, esi, pt, tds },
    otherDeductions,
    totalDeductions,
    net: round2(gross - totalDeductions),
    annualCtc: round2(gross * 12),
  };
}

const EMPTY_COMPONENTS: Components = {
  basic: 0,
  earnings: [],
  deductions: [],
  pf_enabled: true,
  esi_enabled: true,
  pt_enabled: true,
  tds_enabled: false,
  tds_amount: 0,
};

// ── Reusable bits ─────────────────────────────────────────────────────────────
function LineItemsEditor({
  title,
  items,
  onChange,
}: {
  title: string;
  items: LineItem[];
  onChange: (next: LineItem[]) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label>{title}</Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onChange([...items, { label: "", amount: 0 }])}
        >
          <Plus className="size-3.5 mr-1" />
          Add
        </Button>
      </div>
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground mb-1">None. Basic pay only.</p>
      )}
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <Input
              placeholder="Component name"
              value={it.label}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...it, label: e.target.value };
                onChange(next);
              }}
            />
            <Input
              type="number"
              placeholder="0"
              className="w-32"
              value={it.amount || ""}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...it, amount: Number(e.target.value) };
                onChange(next);
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Remove line item"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatutoryToggles({ c, set }: { c: Components; set: (patch: Partial<Components>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <Label>Provident Fund (12% of basic)</Label>
        <Switch checked={c.pf_enabled} onCheckedChange={(v) => set({ pf_enabled: v })} />
      </div>
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <Label>ESI (0.75% of gross ≤ ₹21k)</Label>
        <Switch checked={c.esi_enabled} onCheckedChange={(v) => set({ esi_enabled: v })} />
      </div>
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <Label>Professional Tax (₹200)</Label>
        <Switch checked={c.pt_enabled} onCheckedChange={(v) => set({ pt_enabled: v })} />
      </div>
      <div className="rounded-lg border px-3 py-2">
        <div className="flex items-center justify-between">
          <Label>TDS (income tax)</Label>
          <Switch checked={c.tds_enabled} onCheckedChange={(v) => set({ tds_enabled: v })} />
        </div>
        {c.tds_enabled && (
          <Input
            type="number"
            className="mt-2 h-8"
            placeholder="Monthly TDS amount"
            value={c.tds_amount || ""}
            onChange={(e) => set({ tds_amount: Number(e.target.value) })}
          />
        )}
      </div>
    </div>
  );
}

function BreakdownPanel({ b }: { b: Breakdown }) {
  const Row = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
    <div className={`flex justify-between py-1 ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span>{money(value)}</span>
    </div>
  );
  return (
    <div className="rounded-xl bg-muted/40 p-4 text-sm">
      <Row label="Basic" value={b.basic} />
      {b.earnings.map((e, i) => (
        <Row key={i} label={e.label} value={e.amount} />
      ))}
      <div className="border-t my-1" />
      <Row label="Gross (monthly)" value={b.gross} strong />
      <div className="mt-2">
        <Row label="Provident Fund" value={b.statutory.pf} />
        <Row label="ESI" value={b.statutory.esi} />
        <Row label="Professional Tax" value={b.statutory.pt} />
        <Row label="TDS" value={b.statutory.tds} />
        {b.deductions.map((d, i) => (
          <Row key={i} label={d.label} value={d.amount} />
        ))}
        <Row label="Total deductions" value={b.totalDeductions} strong />
      </div>
      <div className="border-t my-1" />
      <div className="flex justify-between py-1 text-base font-bold text-primary">
        <span>Net pay (monthly)</span>
        <span>{money(b.net)}</span>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Annual CTC (gross × 12)</span>
        <span>{money(b.annualCtc)}</span>
      </div>
    </div>
  );
}

// ── Templates tab ─────────────────────────────────────────────────────────────
function TemplatesTab() {
  const qc = useQueryClient();
  const { data: templates } = useQuery({
    queryKey: ["salary-templates"],
    queryFn: () => apiGet<Template[]>("/hr/salary-templates"),
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [meta, setMeta] = useState({ name: "", code: "", description: "" });
  const [comp, setComp] = useState<Components>(EMPTY_COMPONENTS);
  const set = (patch: Partial<Components>) => setComp((c) => ({ ...c, ...patch }));
  const live = useMemo(() => preview(comp), [comp]);

  const openAdd = () => {
    setEditing(null);
    setMeta({ name: "", code: "", description: "" });
    setComp(EMPTY_COMPONENTS);
    setOpen(true);
  };
  const openEdit = (t: Template) => {
    setEditing(t);
    setMeta({ name: t.name, code: t.code, description: t.description ?? "" });
    setComp({
      basic: Number(t.basic),
      earnings: (t.earnings ?? []).map((e) => ({ ...e, amount: Number(e.amount) })),
      deductions: (t.deductions ?? []).map((d) => ({ ...d, amount: Number(d.amount) })),
      pf_enabled: t.pf_enabled,
      esi_enabled: t.esi_enabled,
      pt_enabled: t.pt_enabled,
      tds_enabled: t.tds_enabled,
      tds_amount: Number(t.tds_amount),
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({ ...meta, ...comp });
      const res = editing
        ? await apiFetch(`/hr/salary-templates/${editing.id}`, { method: "PATCH", body })
        : await apiFetch("/hr/salary-templates", { method: "POST", body });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not save template");
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Template updated" : "Template created");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["salary-templates"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/hr/salary-templates/${id}`, { method: "DELETE" });
      if (!res || !res.ok) throw new Error("Could not delete template");
    },
    onSuccess: () => {
      toast.success("Template removed");
      qc.invalidateQueries({ queryKey: ["salary-templates"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4 mr-1" />
          New template
        </Button>
      </div>
      {templates && templates.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No salary templates yet"
          hint="Create a reusable pay structure to apply when setting employee salaries."
        />
      )}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(templates ?? []).map((t) => (
          <Card key={t.id} className="p-5 rounded-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{t.name}</h3>
                <p className="text-xs text-muted-foreground font-mono">{t.code}</p>
              </div>
              <div className="flex">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Edit ${t.name}`}
                  onClick={() => openEdit(t)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${t.name}`}
                  onClick={() => remove.mutate(t.id)}
                >
                  <Trash2 className="size-4 text-red-600" />
                </Button>
              </div>
            </div>
            {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {t.pf_enabled && <StatusBadge tone="info" label="PF" />}
              {t.esi_enabled && <StatusBadge tone="info" label="ESI" />}
              {t.pt_enabled && <StatusBadge tone="info" label="PT" />}
              {t.tds_enabled && <StatusBadge tone="warning" label="TDS" />}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Gross / month</p>
                <p className="font-semibold">{money(t.breakdown.gross)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Net / month</p>
                <p className="font-semibold text-primary">{money(t.breakdown.net)}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit salary template" : "New salary template"}</DialogTitle>
          </DialogHeader>
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={meta.name}
                    onChange={(e) => setMeta({ ...meta, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>
                    Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={meta.code}
                    placeholder="TPL-…"
                    onChange={(e) => setMeta({ ...meta, code: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={meta.description}
                  onChange={(e) => setMeta({ ...meta, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Basic pay (monthly)</Label>
                <Input
                  type="number"
                  value={comp.basic || ""}
                  onChange={(e) => set({ basic: Number(e.target.value) })}
                />
              </div>
              <LineItemsEditor
                title="Earnings / allowances"
                items={comp.earnings}
                onChange={(earnings) => set({ earnings })}
              />
              <LineItemsEditor
                title="Other deductions"
                items={comp.deductions}
                onChange={(deductions) => set({ deductions })}
              />
              <StatutoryToggles c={comp} set={set} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Live breakdown
              </p>
              <BreakdownPanel b={live} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!meta.name || !meta.code}>
              {editing ? "Save changes" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Set Salary (per-employee) tab ─────────────────────────────────────────────
function SetSalaryTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [staffId, setStaffId] = useState<string | null>(null);

  const { data: staff } = useQuery({
    queryKey: ["hr-staff-list"],
    queryFn: () => apiGet<StaffRow[]>("/hr/staff"),
  });
  const { data: templates } = useQuery({
    queryKey: ["salary-templates"],
    queryFn: () => apiGet<Template[]>("/hr/salary-templates"),
  });
  const { data: current } = useQuery({
    queryKey: ["employee-salary", staffId],
    queryFn: () => apiGet<EmployeeSalary>(`/hr/staff/${staffId}/salary`),
    enabled: !!staffId,
  });

  const filtered = (staff ?? []).filter((s) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return s.full_name.toLowerCase().includes(t) || s.employee_code.toLowerCase().includes(t);
  });
  const selected = (staff ?? []).find((s) => s.id === staffId) ?? null;

  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("none");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [comp, setComp] = useState<Components>(EMPTY_COMPONENTS);
  const set = (patch: Partial<Components>) => setComp((c) => ({ ...c, ...patch }));
  const live = useMemo(() => preview(comp), [comp]);

  const openSet = () => {
    const s = current?.structure;
    setTemplateId("none");
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setNotes(s?.notes ?? "");
    setComp(
      s
        ? {
            basic: Number(s.basic),
            earnings: (s.earnings ?? []).map((e) => ({ ...e, amount: Number(e.amount) })),
            deductions: (s.deductions ?? []).map((d) => ({ ...d, amount: Number(d.amount) })),
            pf_enabled: s.pf_enabled,
            esi_enabled: s.esi_enabled,
            pt_enabled: s.pt_enabled,
            tds_enabled: s.tds_enabled,
            tds_amount: Number(s.tds_amount),
          }
        : EMPTY_COMPONENTS,
    );
    setOpen(true);
  };

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = (templates ?? []).find((x) => x.id === id);
    if (!t) return;
    setComp({
      basic: Number(t.basic),
      earnings: (t.earnings ?? []).map((e) => ({ ...e, amount: Number(e.amount) })),
      deductions: (t.deductions ?? []).map((d) => ({ ...d, amount: Number(d.amount) })),
      pf_enabled: t.pf_enabled,
      esi_enabled: t.esi_enabled,
      pt_enabled: t.pt_enabled,
      tds_enabled: t.tds_enabled,
      tds_amount: Number(t.tds_amount),
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/hr/staff/${staffId}/salary`, {
        method: "PUT",
        body: JSON.stringify({
          template_id: templateId === "none" ? null : templateId,
          effective_from: effectiveFrom,
          notes,
          ...comp,
        }),
      });
      if (!res || !res.ok) {
        const b = res ? await res.json().catch(() => null) : null;
        throw new Error(b?.message ?? "Could not save salary");
      }
    },
    onSuccess: () => {
      toast.success("Salary saved");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["employee-salary", staffId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      {/* Employee picker */}
      <Card className="rounded-2xl p-3 h-fit">
        <Input
          placeholder="Search staff…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mb-2"
        />
        <div className="max-h-[60vh] overflow-y-auto space-y-1">
          {filtered.slice(0, 100).map((s) => (
            <button
              key={s.id}
              onClick={() => setStaffId(s.id)}
              className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                s.id === staffId ? "bg-primary/10 text-foreground" : "hover:bg-muted"
              }`}
            >
              <div className="font-medium">{s.full_name}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {s.employee_code} · {s.department}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Detail */}
      <div>
        {!selected && (
          <EmptyState
            icon={Wallet}
            title="Select an employee"
            hint="Pick a staff member to view or set their salary structure."
          />
        )}
        {selected && (
          <Card className="rounded-2xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{selected.full_name}</h3>
                <p className="text-sm text-muted-foreground font-mono">
                  {selected.employee_code} · {selected.department}
                </p>
              </div>
              <Button onClick={openSet}>
                <Wallet className="size-4 mr-1" />
                {current?.structure ? "Revise salary" : "Set salary"}
              </Button>
            </div>
            {current?.breakdown ? (
              <div className="grid md:grid-cols-2 gap-4">
                <BreakdownPanel b={current.breakdown} />
                <div className="text-sm space-y-2">
                  <div>
                    <p className="text-muted-foreground text-xs">Effective from</p>
                    <p>{current.structure?.effective_from?.slice(0, 10) ?? "—"}</p>
                  </div>
                  {current.structure?.template && (
                    <div>
                      <p className="text-muted-foreground text-xs">Based on template</p>
                      <p>
                        {current.structure.template.name}{" "}
                        <span className="text-muted-foreground">
                          ({current.structure.template.code})
                        </span>
                      </p>
                    </div>
                  )}
                  {current.structure?.notes && (
                    <div>
                      <p className="text-muted-foreground text-xs">Notes</p>
                      <p>{current.structure.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No salary structure set for this employee yet.
              </p>
            )}
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set salary — {selected?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="grid lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Apply template</Label>
                  <Select value={templateId} onValueChange={applyTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (custom)</SelectItem>
                      {(templates ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Effective from</Label>
                  <Input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Basic pay (monthly)</Label>
                <Input
                  type="number"
                  value={comp.basic || ""}
                  onChange={(e) => set({ basic: Number(e.target.value) })}
                />
              </div>
              <LineItemsEditor
                title="Earnings / allowances"
                items={comp.earnings}
                onChange={(earnings) => set({ earnings })}
              />
              <LineItemsEditor
                title="Other deductions"
                items={comp.deductions}
                onChange={(deductions) => set({ deductions })}
              />
              <StatutoryToggles c={comp} set={set} />
              <div>
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Live breakdown
              </p>
              <BreakdownPanel b={live} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={comp.basic <= 0}>
              Save salary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Page() {
  return (
    <>
      <PageHeader
        title="Salary & Compensation"
        subtitle="Reusable salary templates and per-employee pay structures with live statutory computation."
      />
      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees">Set Salary</TabsTrigger>
          <TabsTrigger value="templates">Salary Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="pt-4">
          <SetSalaryTab />
        </TabsContent>
        <TabsContent value="templates" className="pt-4">
          <TemplatesTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

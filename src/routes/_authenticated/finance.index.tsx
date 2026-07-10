import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  IndianRupee,
  Wallet,
  AlertTriangle,
  Undo2,
  Briefcase,
  Receipt,
  TrendingUp,
  TrendingDown,
  Send,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
} from "recharts";
import { money } from "@/lib/module-util";

export const Route = createFileRoute("/_authenticated/finance/")({ component: Page });

type PeriodKey = "this_month" | "last_month" | "this_term" | "custom";

function periodRange(
  key: PeriodKey,
  custom: { from: string; to: string },
): { from: Date; to: Date; label: string } {
  const now = new Date();
  const y = now.getFullYear(),
    m = now.getMonth();
  if (key === "this_month")
    return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0, 23, 59, 59), label: "This month" };
  if (key === "last_month")
    return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0, 23, 59, 59), label: "Last month" };
  if (key === "this_term") {
    // Simple term model: Jan–Jun = Term 1, Jul–Dec = Term 2
    const termStart = m < 6 ? new Date(y, 0, 1) : new Date(y, 6, 1);
    const termEnd = m < 6 ? new Date(y, 5, 30, 23, 59, 59) : new Date(y, 11, 31, 23, 59, 59);
    return { from: termStart, to: termEnd, label: "This term" };
  }
  return {
    from: new Date(custom.from || `${y}-${String(m + 1).padStart(2, "0")}-01`),
    to: new Date((custom.to || new Date().toISOString().slice(0, 10)) + "T23:59:59"),
    label: "Custom",
  };
}

function Page() {
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const range = useMemo(() => periodRange(period, custom), [period, custom]);

  const { data: payments } = useQuery({
    queryKey: ["fin-payments"],
    queryFn: async () =>
      (await supabase.from("payments").select("id,amount,status,paid_at").limit(5000)).data ?? [],
  });
  const { data: fees } = useQuery({
    queryKey: ["fin-fees"],
    queryFn: async () =>
      (
        await supabase
          .from("fee_assignments")
          .select("id,student_id,amount_due,amount_paid,status,due_date")
          .limit(10000)
      ).data ?? [],
  });
  const { data: expenses } = useQuery({
    queryKey: ["fin-exp"],
    queryFn: async () =>
      (await supabase.from("expenses").select("id,amount,expense_date").limit(5000)).data ?? [],
  });
  const { data: payroll } = useQuery({
    queryKey: ["fin-payroll"],
    queryFn: async () =>
      (await supabase.from("payroll_runs").select("id,net_salary,status,month").limit(5000)).data ??
      [],
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const inRange = (d?: string | null) => {
    if (!d) return false;
    const t = new Date(d).getTime();
    return t >= range.from.getTime() && t <= range.to.getTime();
  };

  const revenue = (payments ?? [])
    .filter((p: any) => p.status === "successful" && inRange(p.paid_at))
    .reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
  const outstanding = (fees ?? []).reduce(
    (a: number, f: any) => a + Math.max(0, Number(f.amount_due) - Number(f.amount_paid || 0)),
    0,
  );
  const todaysCollections = (payments ?? [])
    .filter((p: any) => p.status === "successful" && (p.paid_at ?? "").slice(0, 10) === todayStr)
    .reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
  const refunds = (payments ?? [])
    .filter((p: any) => p.status === "refunded" && inRange(p.paid_at))
    .reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
  const payrollPeriod = (payroll ?? [])
    .filter((p: any) => p.status === "paid" && inRange(p.month))
    .reduce((a: number, p: any) => a + Number(p.net_salary || 0), 0);
  const expensePeriod = (expenses ?? [])
    .filter((e: any) => inRange(e.expense_date))
    .reduce((a: number, e: any) => a + Number(e.amount || 0), 0);

  // 6-month revenue trend
  const trend = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleString("en-IN", { month: "short" }),
        revenue: 0,
      });
    }
    for (const p of (payments ?? []) as any[]) {
      if (p.status !== "successful" || !p.paid_at) continue;
      const k = p.paid_at.slice(0, 7);
      const b = buckets.find((x) => x.key === k);
      if (b) b.revenue += Number(p.amount || 0);
    }
    return buckets;
  }, [payments]);

  // Collection efficiency: this term vs last term
  const efficiency = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    const thisTerm = {
      from: m < 6 ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), 6, 1),
      to:
        m < 6
          ? new Date(now.getFullYear(), 5, 30, 23, 59, 59)
          : new Date(now.getFullYear(), 11, 31, 23, 59, 59),
    };
    const lastTerm =
      m < 6
        ? {
            from: new Date(now.getFullYear() - 1, 6, 1),
            to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59),
          }
        : {
            from: new Date(now.getFullYear(), 0, 1),
            to: new Date(now.getFullYear(), 5, 30, 23, 59, 59),
          };
    const collected = (r: { from: Date; to: Date }) =>
      (payments ?? [])
        .filter(
          (p: any) =>
            p.status === "successful" &&
            p.paid_at &&
            new Date(p.paid_at) >= r.from &&
            new Date(p.paid_at) <= r.to,
        )
        .reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
    const invoiced =
      (fees ?? []).reduce((a: number, f: any) => a + Number(f.amount_due || 0), 0) || 1;
    const cThis = collected(thisTerm),
      cLast = collected(lastTerm);
    return { thisPct: (cThis / invoiced) * 100, lastPct: (cLast / invoiced) * 100 };
  }, [payments, fees]);

  // Fee collection by grade/section
  const { data: byClass } = useQuery({
    queryKey: ["fin-by-class"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_assignments")
        .select("amount_due,amount_paid,students!inner(class_id,classes(id,name,section))")
        .limit(20000);
      const map = new Map<
        string,
        { id: string; label: string; collected: number; outstanding: number }
      >();
      for (const r of (data ?? []) as any[]) {
        const c = r.students?.classes;
        if (!c) continue;
        const key = c.id;
        const cur = map.get(key) ?? {
          id: c.id,
          label: `${c.name}${c.section ? `·${c.section}` : ""}`,
          collected: 0,
          outstanding: 0,
        };
        cur.collected += Number(r.amount_paid || 0);
        cur.outstanding += Math.max(0, Number(r.amount_due || 0) - Number(r.amount_paid || 0));
        map.set(key, cur);
      }
      return Array.from(map.values()).sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true }),
      );
    },
  });

  // Top 10 overdue accounts
  const { data: overdue } = useQuery({
    queryKey: ["fin-overdue"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_assignments")
        .select(
          "id,student_id,amount_due,amount_paid,due_date,status,students(admission_no,profiles(full_name))",
        )
        .neq("status", "paid")
        .lt("due_date", new Date().toISOString().slice(0, 10))
        .limit(200);
      const rows = (data ?? [])
        .map((r: any) => ({
          id: r.id,
          student_id: r.student_id,
          name: r.students?.profiles?.full_name || r.students?.admission_no || "—",
          admission_no: r.students?.admission_no,
          amount: Math.max(0, Number(r.amount_due || 0) - Number(r.amount_paid || 0)),
          days: Math.max(0, Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86_400_000)),
        }))
        .filter((r) => r.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10);
      return rows;
    },
  });

  return (
    <>
      <PageHeader
        title="Finance Dashboard"
        subtitle={`Revenue, expenses, payroll and outstanding fees — ${range.label}.`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {(["this_month", "last_month", "this_term", "custom"] as PeriodKey[]).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={period === k ? "default" : "outline"}
                onClick={() => setPeriod(k)}
              >
                {k === "this_month"
                  ? "This month"
                  : k === "last_month"
                    ? "Last month"
                    : k === "this_term"
                      ? "This term"
                      : "Custom"}
              </Button>
            ))}
            {period === "custom" && (
              <>
                <Input
                  type="date"
                  className="h-8 w-[140px]"
                  value={custom.from}
                  onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                />
                <Input
                  type="date"
                  className="h-8 w-[140px]"
                  value={custom.to}
                  onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                />
              </>
            )}
          </div>
        }
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat icon={IndianRupee} label="Revenue" value={money(revenue)} tint="text-emerald-600" />
        <Stat
          icon={AlertTriangle}
          label="Outstanding"
          value={money(outstanding)}
          tint="text-amber-600"
        />
        <Stat icon={Wallet} label="Today" value={money(todaysCollections)} tint="text-foreground" />
        <Stat icon={Undo2} label="Refunds" value={money(refunds)} tint="text-red-600" />
        <Stat
          icon={Briefcase}
          label="Payroll"
          value={money(payrollPeriod)}
          tint="text-foreground"
        />
        <Stat icon={Receipt} label="Expenses" value={money(expensePeriod)} tint="text-foreground" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="p-4 rounded-2xl lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium">Revenue trend (last 6 months)</div>
            <div className="text-xs text-muted-foreground">Successful payments</div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis
                  fontSize={12}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  width={60}
                />
                <Tooltip formatter={(v: any) => money(Number(v))} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4 rounded-2xl">
          <div className="font-medium mb-2">Collection efficiency</div>
          <div className="text-3xl font-semibold">{efficiency.thisPct.toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground mt-1">This term of total invoiced</div>
          <div className="mt-4 flex items-center gap-2 text-sm">
            {efficiency.thisPct >= efficiency.lastPct ? (
              <TrendingUp className="size-4 text-emerald-600" />
            ) : (
              <TrendingDown className="size-4 text-red-600" />
            )}
            <span
              className={
                efficiency.thisPct >= efficiency.lastPct ? "text-emerald-600" : "text-red-600"
              }
            >
              {(efficiency.thisPct - efficiency.lastPct).toFixed(1)} pts vs last term
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Last term: {efficiency.lastPct.toFixed(1)}%
          </div>
        </Card>
      </div>

      <Card className="p-4 rounded-2xl mt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Fee collection by class</div>
          <div className="text-xs text-muted-foreground">Click a bar to open that class's fees</div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byClass ?? []} margin={{ left: 8, right: 8, top: 8, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="label"
                fontSize={10}
                angle={-45}
                textAnchor="end"
                interval={0}
                height={60}
              />
              <YAxis fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} width={70} />
              <Tooltip formatter={(v: any) => money(Number(v))} />
              <Legend />
              <Bar
                dataKey="collected"
                stackId="a"
                fill="hsl(var(--primary))"
                name="Collected"
                onClick={(d: any) => {
                  if (d?.id) window.location.assign(`/classes/${d.id}?tab=fees`);
                }}
                style={{ cursor: "pointer" }}
              />
              <Bar
                dataKey="outstanding"
                stackId="a"
                fill="hsl(var(--destructive))"
                name="Outstanding"
                onClick={(d: any) => {
                  if (d?.id) window.location.assign(`/classes/${d.id}?tab=fees`);
                }}
                style={{ cursor: "pointer" }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4 rounded-2xl mt-6">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Top 10 overdue accounts</div>
          <Link to="/communication" className="text-xs text-primary hover:underline">
            Open Communication
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="p-2">Student</th>
                <th className="p-2">Admission #</th>
                <th className="p-2">Overdue</th>
                <th className="p-2">Days</th>
                <th className="p-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(overdue ?? []).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.admission_no}</td>
                  <td className="p-2 font-medium text-amber-700">{money(r.amount)}</td>
                  <td className="p-2">{r.days}</td>
                  <td className="p-2 text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/communication">
                        <Send className="size-3.5 mr-1" />
                        Send Reminder
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
              {(!overdue || overdue.length === 0) && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">
                    No overdue accounts.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: any;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <Icon className={`size-4 ${tint}`} />
      </div>
      <div className={`text-2xl font-semibold mt-1 ${tint}`}>{value}</div>
    </Card>
  );
}

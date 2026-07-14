import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type IconType = React.ComponentType<{ className?: string }>;

/**
 * A module "command card" for the admin dashboard: a mini-dashboard for one
 * module — a couple of KPIs, a chart/meter, a status alert, and a "View all →"
 * deep link. Optionally tabbed; when `tabs` is set, `children` is a render
 * function receiving the active tab key.
 */
export function ModuleCard({
  icon: Icon,
  title,
  to,
  tabs,
  children,
}: {
  icon: IconType;
  title: string;
  to?: string;
  tabs?: { key: string; label: string }[];
  children: React.ReactNode | ((tab: string) => React.ReactNode);
}) {
  const [tab, setTab] = useState(tabs?.[0]?.key ?? "");
  return (
    <Card className="flex flex-col rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          {title}
        </div>
        {to && (
          <Link
            to={to}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all →
          </Link>
        )}
      </div>
      {tabs && (
        <div className="mb-3 inline-flex gap-0.5 self-start rounded-lg bg-muted/50 p-0.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition",
                tab === t.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-1 flex-col">
        {typeof children === "function" ? children(tab) : children}
      </div>
    </Card>
  );
}

/** Three-up stat cells (e.g. Classes / Sections / Subjects). */
export function StatTrio({
  items,
}: {
  items: { n: string; k: string; tone?: "good" | "crit" }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {items.map((c, i) => (
        <div key={i} className="rounded-xl bg-muted/40 p-2.5">
          <div
            className={cn(
              "text-lg font-bold tabular-nums",
              c.tone === "good" && "text-emerald-600 dark:text-emerald-400",
              c.tone === "crit" && "text-red-600 dark:text-red-400",
            )}
          >
            {c.n}
          </div>
          <div className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground">{c.k}</div>
        </div>
      ))}
    </div>
  );
}

/** Label + value with a progress track underneath. */
export function MeterRow({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

/** A simple key/value row (no bar). */
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  );
}

/** Horizontal mini-bars for a small distribution (dept headcount, categories…). */
export function MiniBars({
  rows,
}: {
  rows: { label: string; value: number; max: number; tone?: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-2 text-xs">
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted">
            <span
              className={cn("block h-full rounded-full", !r.tone && "bg-primary")}
              style={{
                width: `${r.max ? Math.max(4, (r.value / r.max) * 100) : 0}%`,
                ...(r.tone ? { background: r.tone } : {}),
              }}
            />
          </span>
          <span className="text-right font-semibold tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** A left-to-right funnel of pipeline stages. */
export function Funnel({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[5.5rem_1fr_1.5rem] items-center gap-2 text-xs">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="h-5 overflow-hidden rounded-md bg-muted">
            <span
              className="block h-full rounded-md bg-gradient-to-r from-primary to-primary/60"
              style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="text-right font-semibold tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Status strip at the foot of a card. */
export function CardAlert({
  tone = "warning",
  children,
}: {
  tone?: "warning" | "critical" | "good";
  children: React.ReactNode;
}) {
  const cls = {
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    critical: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300",
    good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  }[tone];
  return (
    <div
      className={cn(
        "mt-auto flex items-center gap-2 rounded-lg px-3 py-2 pt-2 text-xs font-medium",
        cls,
      )}
    >
      {children}
    </div>
  );
}

/** Compact loading placeholder for a card body. */
export function CardLoading() {
  return (
    <div className="flex-1 animate-pulse space-y-2 py-1">
      <div className="grid grid-cols-3 gap-2">
        <div className="h-14 rounded-xl bg-muted" />
        <div className="h-14 rounded-xl bg-muted" />
        <div className="h-14 rounded-xl bg-muted" />
      </div>
      <div className="h-2 rounded bg-muted" />
      <div className="h-2 w-2/3 rounded bg-muted" />
    </div>
  );
}

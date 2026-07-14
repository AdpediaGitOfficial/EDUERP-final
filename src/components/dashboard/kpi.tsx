import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * Analytics KPI tile for the admin command strip. A tile shows a value, an
 * optional period-over-period delta (▲/▼) and an optional status chip
 * (LIVE / CRITICAL). `plain` tiles sit on the card surface; `violet`/`coral`
 * are the saturated "act now" heroes reused from the app's stat palette.
 */
export type KpiTone = "plain" | "violet" | "coral" | "sky" | "indigo";
export type KpiDelta = { text: string; dir?: "up" | "down" | "flat"; sub?: string };
export type KpiChip = { label: string; tone: "live" | "critical" | "info" | "good" };

const TONE: Record<KpiTone, string> = {
  plain: "bg-card border border-border",
  violet: "bg-stat-violet text-stat-violet-foreground",
  coral: "bg-stat-coral text-stat-coral-foreground",
  sky: "bg-stat-sky text-stat-sky-foreground",
  indigo: "bg-stat-indigo text-stat-indigo-foreground",
};

export function KpiTile({
  label,
  value,
  delta,
  chip,
  tone = "plain",
  to,
  spark,
}: {
  label: string;
  value: string;
  delta?: KpiDelta;
  chip?: KpiChip;
  tone?: KpiTone;
  to?: string;
  spark?: number[];
}) {
  const hero = tone === "violet" || tone === "coral";
  const body = (
    <div
      className={cn(
        "relative flex min-h-[104px] flex-col gap-1 overflow-hidden rounded-xl p-3.5 transition-shadow",
        TONE[tone],
        to && "hover:shadow-md",
      )}
    >
      <div
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wide",
          hero ? "opacity-80" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div className="font-display text-2xl font-semibold leading-tight tabular-nums">{value}</div>
      {spark && spark.length > 1 && (
        <Sparkline points={spark} hero={hero} className="absolute right-2.5 top-3" />
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {chip && <Chip chip={chip} hero={hero} />}
        {delta && <Delta delta={delta} hero={hero} />}
      </div>
    </div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function Delta({ delta, hero }: { delta: KpiDelta; hero: boolean }) {
  const arrow = delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "";
  const color = hero
    ? ""
    : delta.dir === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : delta.dir === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11.5px] font-semibold",
        color,
        hero && "opacity-90",
      )}
    >
      {arrow && <span aria-hidden>{arrow}</span>}
      {delta.text}
      {delta.sub && (
        <span className={cn("font-normal", hero ? "opacity-70" : "text-muted-foreground")}>
          {delta.sub}
        </span>
      )}
    </span>
  );
}

function Chip({ chip, hero }: { chip: KpiChip; hero: boolean }) {
  const tones: Record<KpiChip["tone"], string> = {
    live: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    critical: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    info: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    good: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider",
        hero ? "bg-white/20 text-current" : tones[chip.tone],
      )}
    >
      {chip.tone === "live" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {chip.tone === "critical" && <span aria-hidden>⚠</span>}
      {chip.label}
    </span>
  );
}

function Sparkline({
  points,
  hero,
  className,
}: {
  points: number[];
  hero: boolean;
  className?: string;
}) {
  const w = 54;
  const h = 18;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const rng = max - min || 1;
  const d = points
    .map((p, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / rng) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden>
      <polyline
        points={d}
        fill="none"
        stroke={hero ? "currentColor" : "var(--chart-1)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={hero ? 0.7 : 0.9}
      />
    </svg>
  );
}

/** Subtle group heading so a wall of tiles reads as organized sections. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

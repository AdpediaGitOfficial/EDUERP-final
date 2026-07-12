/**
 * Chart colour palette — the single source of truth for recharts fills/strokes.
 *
 * Every value references a design-system CSS custom property from `src/styles.css`
 * (all oklch), so charts:
 *   • stay consistent with the rest of the UI,
 *   • adapt automatically to dark mode (the vars are redefined under `.dark`),
 *   • never hardcode a hex/oklch literal in a screen again.
 *
 * Modern browsers resolve `var(--…)` inside SVG presentation attributes (Chromium,
 * the app's target, does), so `<Bar fill={CHART[0]} />` renders the themed colour.
 *
 * Before: `fill="#6366f1"`, `fill="hsl(var(--primary))"` (invalid — token is oklch,
 * so it fell back to black), `fill="#10b981"`. After: `fill={CHART[i]}` /
 * `fill={CHART_SUCCESS}`.
 */

// Categorical series palette (charts with multiple series / pie slices).
export const CHART = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

// Semantic single-series colours, mapped to the closest chart/status token.
export const CHART_PRIMARY = "var(--primary)";
export const CHART_SUCCESS = "var(--chart-2)"; // teal/green family
export const CHART_WARNING = "var(--chart-4)"; // amber family
export const CHART_DANGER = "var(--destructive)";
export const CHART_INFO = "var(--chart-1)"; // indigo/blue family
export const CHART_GRID = "var(--border)";
export const CHART_MUTED = "var(--muted-foreground)";

/** Colour for the i-th categorical series, cycling the palette. */
export const chartColor = (i: number) => CHART[i % CHART.length];

/**
 * Status → chart colour, matching the StatusBadge tone vocabulary
 * (success/warning/danger/info/neutral) used across the app.
 */
export const STATUS_CHART: Record<string, string> = {
  success: CHART_SUCCESS,
  warning: CHART_WARNING,
  danger: CHART_DANGER,
  info: CHART_INFO,
  neutral: CHART_MUTED,
};

/**
 * Gender palette used by demographic donuts. Keyed to design tokens so the
 * ratio charts theme with the rest of the app instead of raw hex.
 */
export const GENDER_CHART: Record<string, string> = {
  male: "var(--chart-1)",
  female: "var(--chart-5)",
  other: "var(--chart-4)",
  unknown: "var(--muted-foreground)",
};

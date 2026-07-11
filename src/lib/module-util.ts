// Shared helpers for HR / Finance / Reception / Fleet / Teacher modules.

export function money(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(v || 0);
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.round(ms / 86_400_000);
}

/**
 * Single source of truth for status → colour across the whole app.
 * Semantics are consistent: emerald = positive/done, amber = pending/attention,
 * red = negative/overdue, blue = informational, slate = neutral/inactive.
 * `badgeClass()` and the shared <StatusBadge> both read from this map so a given
 * status never drifts to a different colour between modules.
 */
const TONE = {
  success: "bg-emerald-100 text-emerald-800 border-0",
  warning: "bg-amber-100 text-amber-800 border-0",
  danger: "bg-red-100 text-red-800 border-0",
  info: "bg-blue-100 text-blue-800 border-0",
  neutral: "bg-slate-200 text-slate-700 border-0",
} as const;

export const STATUS_BADGE: Record<string, string> = {
  // lifecycle
  active: TONE.success,
  inactive: TONE.neutral,
  on_leave: TONE.warning,
  maintenance: TONE.warning,
  // approvals / requests
  approved: TONE.success,
  pending: TONE.warning,
  rejected: TONE.danger,
  cancelled: TONE.neutral,
  // fees / payments
  paid: TONE.success,
  successful: TONE.success,
  partial: TONE.warning,
  unpaid: TONE.danger,
  overdue: TONE.danger,
  failed: TONE.danger,
  refunded: TONE.info,
  waived: TONE.neutral,
  reconciled: TONE.success,
  unreconciled: TONE.warning,
  // attendance
  present: TONE.success,
  absent: TONE.danger,
  late: TONE.warning,
  leave: TONE.info,
  half_day: TONE.warning,
  // admissions pipeline
  new: TONE.info,
  follow_up: TONE.warning,
  converted: TONE.success,
  lost: TONE.neutral,
  // complaints / tickets
  open: TONE.warning,
  in_review: TONE.info,
  in_progress: TONE.info,
  resolved: TONE.success,
  closed: TONE.neutral,
  dismissed: TONE.neutral,
  // assets / inventory
  available: TONE.success,
  in_use: TONE.info,
  repair: TONE.warning,
  retired: TONE.neutral,
  disposed: TONE.danger,
  // maintenance / tasks
  scheduled: TONE.info,
  completed: TONE.success,
  // library
  returned: TONE.neutral,
  borrowed: TONE.warning,
  // severity
  high: TONE.danger,
  medium: TONE.warning,
  low: TONE.neutral,
};

export function badgeClass(status: string): string {
  return STATUS_BADGE[status?.toLowerCase?.() ?? status] ?? TONE.neutral.replace("200", "100");
}

export function niceLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function firstOfMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Download an array of records as CSV. Keys of the first row become the header.
export function downloadCsv(rows: Record<string, any>[], filename: string): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

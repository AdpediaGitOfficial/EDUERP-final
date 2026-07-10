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

export const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 border-0",
  on_leave: "bg-amber-100 text-amber-800 border-0",
  inactive: "bg-slate-200 text-slate-700 border-0",
  paid: "bg-emerald-100 text-emerald-800 border-0",
  pending: "bg-amber-100 text-amber-800 border-0",
  approved: "bg-emerald-100 text-emerald-800 border-0",
  rejected: "bg-red-100 text-red-800 border-0",
  present: "bg-emerald-100 text-emerald-800 border-0",
  absent: "bg-red-100 text-red-800 border-0",
  late: "bg-amber-100 text-amber-800 border-0",
  new: "bg-blue-100 text-blue-800 border-0",
  follow_up: "bg-amber-100 text-amber-800 border-0",
  converted: "bg-emerald-100 text-emerald-800 border-0",
  lost: "bg-slate-200 text-slate-700 border-0",
  reconciled: "bg-emerald-100 text-emerald-800 border-0",
  unreconciled: "bg-amber-100 text-amber-800 border-0",
};

export function badgeClass(status: string): string {
  return STATUS_BADGE[status] ?? "bg-slate-100 text-slate-700 border-0";
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

export const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  in_use: "In Use",
  repair: "In Repair",
  retired: "Retired",
  disposed: "Disposed",
};

export const STATUS_CLASS: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-900 border-emerald-200",
  in_use: "bg-blue-100 text-blue-900 border-blue-200",
  repair: "bg-amber-100 text-amber-900 border-amber-200",
  retired: "bg-slate-100 text-slate-900 border-slate-200",
  disposed: "bg-red-100 text-red-900 border-red-200",
};

export const STATUS_HEX: Record<string, string> = {
  available: "#10b981",
  in_use: "#3b82f6",
  repair: "#f59e0b",
  retired: "#64748b",
  disposed: "#ef4444",
};

export function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function computeCurrentValue(
  purchasePrice: number | null,
  purchaseDate: string | null,
  usefulLife: number | null,
) {
  if (!purchasePrice || !purchaseDate) return purchasePrice ?? 0;
  const life = usefulLife ?? 5;
  const years = (Date.now() - new Date(purchaseDate).getTime()) / (365.25 * 24 * 3600 * 1000);
  const remaining = Math.max(0, 1 - years / life);
  return Math.round(purchasePrice * remaining);
}

export function depreciationSeries(
  purchasePrice: number,
  purchaseDate: string,
  usefulLife: number,
) {
  const start = new Date(purchaseDate).getFullYear();
  const points: { year: number; value: number }[] = [];
  for (let y = 0; y <= usefulLife; y++) {
    const remaining = Math.max(0, 1 - y / usefulLife);
    points.push({ year: start + y, value: Math.round(purchasePrice * remaining) });
  }
  return points;
}

export function daysBetween(a: string | Date, b: string | Date = new Date()) {
  const A = typeof a === "string" ? new Date(a) : a;
  const B = typeof b === "string" ? new Date(b) : b;
  return Math.floor((B.getTime() - A.getTime()) / (24 * 3600 * 1000));
}

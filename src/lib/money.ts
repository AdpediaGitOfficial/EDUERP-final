// Shared currency formatting. `inr` is the full grouped figure (₹1,24,500);
// `inrShort` is the compact analytics form (₹96.2L, ₹3.02Cr) for KPI tiles and
// dense dashboards where the full figure would overflow.
export const inr = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const inrShort = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(1)}k`;
  return `₹${Math.round(v)}`;
};

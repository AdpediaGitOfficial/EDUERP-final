/**
 * Grade ordering for class-movement rules (mirror of api/src/common/grades.ts).
 * A class's grade is encoded in its name ("Grade 10", "KG", "Nursery"); rank it
 * so the UI can offer only valid destinations:
 *   Promotion → strictly higher grade.   Transfer → same grade, different class.
 * An unknown rank (null) means "cannot validate" — treat as invalid.
 */
const PRE_PRIMARY: Record<string, number> = {
  "pre-nursery": -4,
  prenursery: -4,
  playgroup: -4,
  play: -4,
  nursery: -3,
  nur: -3,
  "pre-kg": -2,
  prekg: -2,
  "pre k.g": -2,
  lkg: -1,
  "l.k.g": -1,
  kg: -1,
  kindergarten: -1,
  ukg: 0,
  "u.k.g": 0,
};

export function gradeRank(className: string | null | undefined): number | null {
  if (!className) return null;
  const s = className.trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/(?:grade|class|std|standard)\s*0*(\d{1,2})\b/);
  if (m) return parseInt(m[1], 10);
  const bare = s.match(/^0*(\d{1,2})$/);
  if (bare) return parseInt(bare[1], 10);
  if (s in PRE_PRIMARY) return PRE_PRIMARY[s];
  return null;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** True only when `to` is a strictly higher grade than `from` (both known). */
export function isPromotion(fromName: string | null, toName: string | null): boolean {
  const a = gradeRank(fromName);
  const b = gradeRank(toName);
  return a !== null && b !== null && b > a;
}

/** True when both classes belong to the same grade (rank match, or exact name). */
export function isSameGrade(aName: string | null, bName: string | null): boolean {
  const ra = gradeRank(aName);
  const rb = gradeRank(bName);
  if (ra !== null && rb !== null) return ra === rb;
  return norm(aName) === norm(bName) && norm(aName) !== "";
}

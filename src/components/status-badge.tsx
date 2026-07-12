import { Badge } from "@/components/ui/badge";
import { badgeClass, niceLabel, TONE, type Tone } from "@/lib/module-util";
import { cn } from "@/lib/utils";

/**
 * App-wide status / semantic pill. Two ways to colour it, both from the single
 * token source in module-util so meaning never drifts between modules:
 *
 *   <StatusBadge status={invoice.status} />          // colour from the STATUS map
 *   <StatusBadge status="in_use" label="On loan" />  // custom label, mapped colour
 *   <StatusBadge tone="danger" label="Overdue" />    // explicit tone for non-status pills
 *
 * Prefer this over inline `bg-*-100 text-*` badges everywhere.
 */
export function StatusBadge({
  status,
  tone,
  label,
  className,
}: {
  status?: string;
  tone?: Tone;
  label?: string;
  className?: string;
}) {
  const colour = tone ? TONE[tone] : badgeClass(status ?? "");
  return (
    <Badge className={cn(colour, "capitalize", className)}>
      {label ?? niceLabel(status ?? "")}
    </Badge>
  );
}

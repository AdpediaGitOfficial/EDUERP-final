import { Badge } from "@/components/ui/badge";
import { badgeClass, niceLabel } from "@/lib/module-util";
import { cn } from "@/lib/utils";

/**
 * App-wide status pill. Colour comes from the single STATUS_BADGE map in
 * module-util, so a given status (paid / pending / overdue / present / …) always
 * renders the same colour everywhere. Prefer this over inline `bg-*-100 text-*`
 * badges so meaning never drifts between modules.
 *
 *   <StatusBadge status={invoice.status} />        // "Overdue" (red)
 *   <StatusBadge status="in_use" label="On loan" /> // custom label, mapped colour
 */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <Badge className={cn(badgeClass(status), "capitalize", className)}>
      {label ?? niceLabel(status)}
    </Badge>
  );
}

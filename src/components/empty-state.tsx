import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Designed empty state: icon + title + optional helper line + optional action.
 * Use instead of a bare "No records." string so every empty list reads the same
 * and tells the user what they can do next.
 *
 *   <EmptyState title="No students match your filters" hint="Try clearing the grade filter." />
 *   <EmptyState icon={Bus} title="No routes yet" action={<Button>Add route</Button>} />
 *
 * In a table, wrap it in a full-width cell: <EmptyRow colSpan={6} ... />.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8" : "py-14",
        className,
      )}
    >
      <div className="size-11 rounded-2xl bg-muted grid place-items-center text-muted-foreground mb-3">
        <Icon className="size-5" />
      </div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground max-w-xs">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Table-friendly variant: renders inside a spanning row. */
export function EmptyRow({
  colSpan,
  title,
  hint,
  icon,
  action,
}: {
  colSpan: number;
  title: string;
  hint?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <EmptyState title={title} hint={hint} icon={icon} action={action} compact />
      </td>
    </tr>
  );
}

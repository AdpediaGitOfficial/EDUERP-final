import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { apiGet } from "@/lib/api/client";
import { GraduationCap } from "lucide-react";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

/**
 * App-wide command palette (⌘K / Ctrl+K). Replaces the previously decorative
 * top-bar search: jump to any module page the current role can see, and — for
 * staff roles — search students by name or admission number and open their
 * profile. Purely client-driven off the role-filtered nav plus the existing
 * /students/search endpoint.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  canSearchStudents,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: NavItem[];
  canSearchStudents: boolean;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");

  // ⌘K / Ctrl+K toggles the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Reset the query each time the palette closes.
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const { data: students } = useQuery({
    enabled: open && canSearchStudents && qDebounced.length >= 2,
    queryKey: ["palette-students", qDebounced],
    queryFn: async () => {
      const res = await apiGet<{ rows: any[] }>(
        `/students/search?q=${encodeURIComponent(qDebounced)}&limit=8`,
      );
      return res.rows;
    },
  });

  const go = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* shouldFilter stays on for pages; student rows are already server-filtered
          and use forceMount-friendly values, so keep them in a separate group. */}
      <CommandInput placeholder="Search pages or students…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Pages">
          {items.map((n) => (
            <CommandItem
              key={n.to}
              value={n.label}
              onSelect={() => go(() => navigate({ to: n.to }))}
            >
              <n.icon className="size-4 mr-2 text-muted-foreground" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {canSearchStudents && (students?.length ?? 0) > 0 && (
          <CommandGroup heading="Students">
            {students!.map((s) => (
              <CommandItem
                key={s.id}
                value={`student-${s.id}-${s.full_name}`}
                onSelect={() =>
                  go(() => navigate({ to: "/students/$studentId", params: { studentId: s.id } }))
                }
              >
                <GraduationCap className="size-4 mr-2 text-muted-foreground" />
                <span className="truncate">{s.full_name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {s.admission_no}
                  {s.class_name
                    ? ` · ${s.class_name}${s.class_section ? " " + s.class_section : ""}`
                    : ""}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

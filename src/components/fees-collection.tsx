import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Filter, X } from "lucide-react";

/** ₹ formatter shared across the collection screens. */
export const inr = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ALL = "__all__";

export type FilterOptions = {
  academicYears: string[];
  classNames: string[];
  sections: string[];
  categories: string[];
  statuses: string[];
};

export type Filters = {
  academicYear: string;
  className: string;
  section: string;
  category: string;
  status: string;
  dueDate: string;
  search: string;
};

export const emptyFilters: Filters = {
  academicYear: "",
  className: "",
  section: "",
  category: "",
  status: "",
  dueDate: "",
  search: "",
};

/** Build the querystring the collection endpoints expect from the filter state. */
export function filtersToQuery(f: Filters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.academicYear) p.set("academicYear", f.academicYear);
  if (f.className) p.set("className", f.className);
  if (f.section) p.set("section", f.section);
  if (f.category) p.set("category", f.category);
  if (f.status) p.set("status", f.status);
  if (f.dueDate) p.set("dueDate", f.dueDate);
  if (f.search.trim()) p.set("search", f.search.trim());
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function useFilterOptions() {
  return useQuery<FilterOptions>({
    queryKey: ["fees-collection", "filters"],
    queryFn: () => apiGet<FilterOptions>("/fees/collection/filters"),
    staleTime: 5 * 60 * 1000,
  });
}

/** Collect ↔ Due Fees sub-navigation. */
export function CollectionSubNav({ active }: { active: "collect" | "due" }) {
  const item = (to: string, label: string, on: boolean) => (
    <Link
      to={to}
      className={cn(
        "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
        on
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border bg-card p-1">
      {item("/finance/collection", "Collect Fees", active === "collect")}
      {item("/finance/collection/due", "Due Fees & Reminders", active === "due")}
    </div>
  );
}

/** The six-filter bar (Academic Year, Class, Section, Category, Status, Due Date) + search. */
export function FilterBar({
  value,
  onChange,
  options,
  hideStatus,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  options?: FilterOptions;
  hideStatus?: boolean;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const dirty =
    value.academicYear ||
    value.className ||
    value.section ||
    value.category ||
    value.status ||
    value.dueDate ||
    value.search;

  const pick = (
    label: string,
    key: keyof Filters,
    items: string[],
    placeholder: string,
  ) => (
    <div className="space-y-1">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Select
        value={value[key] || ALL}
        onValueChange={(v) => set({ [key]: v === ALL ? "" : v } as Partial<Filters>)}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{placeholder}</SelectItem>
          {items.map((it) => (
            <SelectItem key={it} value={it} className="capitalize">
              {it.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3 text-sm font-medium">
        <Filter className="size-4 text-muted-foreground" /> Filters
        {dirty ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs"
            onClick={() => onChange({ ...emptyFilters })}
          >
            <X className="size-3.5" /> Clear
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {pick("Academic Year", "academicYear", options?.academicYears ?? [], "All years")}
        {pick("Class", "className", options?.classNames ?? [], "All classes")}
        {pick("Section", "section", options?.sections ?? [], "All sections")}
        {pick("Fee Category", "category", options?.categories ?? [], "All categories")}
        {!hideStatus &&
          pick("Fee Status", "status", options?.statuses ?? [], "All statuses")}
        <div className="space-y-1">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Due On / Before
          </Label>
          <Input
            type="date"
            className="h-9"
            value={value.dueDate}
            onChange={(e) => set({ dueDate: e.target.value })}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Search
          </Label>
          <Input
            className="h-9"
            placeholder="Admission no or student name"
            value={value.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </div>
      </div>
    </Card>
  );
}

/** Compact stat tile for the collection summary strips. */
export function CollectStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "success";
}) {
  const cls =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("font-display text-xl font-semibold mt-1", cls)}>{value}</div>
    </Card>
  );
}

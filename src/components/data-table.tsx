import { type ReactNode, useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyRow } from "@/components/empty-state";
import { TableSkeleton } from "@/components/query-states";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Column<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Provide to make the column sortable (client-side). */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  headerClassName?: string;
  cellClassName?: string;
};

type SortState = { id: string; dir: "asc" | "desc" } | null;

/**
 * Reusable enterprise data table: client-side sort + pagination, optional row
 * selection with a bulk-action bar, a toolbar slot for search/filters, a
 * responsive mobile card renderer, and standard loading/empty states. One
 * component to replace the many hand-rolled `<table>`s across the app.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading = false,
  onRowClick,
  initialSort = null,
  pageSize: initialPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  emptyIcon,
  emptyTitle = "Nothing to show",
  emptyHint,
  renderMobileCard,
  toolbar,
  selectable = false,
  selectedIds,
  onSelectedChange,
  bulkActions,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  initialSort?: SortState;
  pageSize?: number;
  pageSizeOptions?: number[];
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyHint?: string;
  renderMobileCard?: (row: T) => ReactNode;
  toolbar?: ReactNode;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectedChange?: (ids: Set<string>) => void;
  bulkActions?: ReactNode;
}) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const all = rows ?? [];

  const sorted = useMemo(() => {
    if (!sort) return all;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return all;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...all].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [all, sort, columns]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Keep the page in range as data/filters/pageSize change.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const pageRows = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize],
  );

  const toggleSort = (id: string) => {
    setSort((prev) =>
      prev?.id === id ? (prev.dir === "asc" ? { id, dir: "desc" } : null) : { id, dir: "asc" },
    );
  };
  const sortIcon = (id: string) => {
    if (sort?.id !== id) return <ArrowUpDown className="size-3.5 opacity-40" />;
    return sort.dir === "asc" ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );
  };

  const selected = selectedIds ?? new Set<string>();
  const pageIds = pageRows.map(getRowId);
  const allPageChecked = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const setSelected = (next: Set<string>) => onSelectedChange?.(next);
  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const togglePage = () => {
    const next = new Set(selected);
    if (allPageChecked) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    setSelected(next);
  };

  const colCount = columns.length + (selectable ? 1 : 0);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const alignCls = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="space-y-3">
      {(toolbar || (selectable && selected.size > 0)) && (
        <div className="flex flex-col gap-3">
          {toolbar}
          {selectable && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg bg-accent">
              <span className="text-sm font-medium">{selected.size.toLocaleString()} selected</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {bulkActions}
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Card className="rounded-2xl overflow-hidden">
        {/* Desktop table */}
        <div className={renderMobileCard ? "hidden md:block overflow-x-auto" : "overflow-x-auto"}>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {selectable && (
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={allPageChecked}
                      onCheckedChange={togglePage}
                      aria-label="Select page"
                    />
                  </th>
                )}
                {columns.map((c) => (
                  <th
                    key={c.id}
                    className={`p-3 font-medium ${alignCls(c.align)} ${c.headerClassName ?? ""}`}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort(c.id)}
                      >
                        {c.header} {sortIcon(c.id)}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="p-0">
                    <TableSkeleton rows={6} cols={colCount} />
                  </td>
                </tr>
              ) : (
                <>
                  {pageRows.map((row) => {
                    const id = getRowId(row);
                    return (
                      <tr
                        key={id}
                        className={`border-t hover:bg-muted/40 ${onRowClick ? "cursor-pointer" : ""}`}
                        onClick={
                          onRowClick
                            ? (e) => {
                                if ((e.target as HTMLElement).closest("[data-no-nav]")) return;
                                onRowClick(row);
                              }
                            : undefined
                        }
                      >
                        {selectable && (
                          <td className="p-3" data-no-nav onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selected.has(id)}
                              onCheckedChange={() => toggleRow(id)}
                              aria-label="Select row"
                            />
                          </td>
                        )}
                        {columns.map((c) => (
                          <td
                            key={c.id}
                            className={`p-3 ${alignCls(c.align)} ${c.cellClassName ?? ""}`}
                          >
                            {c.cell(row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <EmptyRow
                      colSpan={colCount}
                      icon={emptyIcon}
                      title={emptyTitle}
                      hint={emptyHint}
                    />
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        {renderMobileCard && (
          <div className="md:hidden divide-y">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
            ) : pageRows.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">{emptyTitle}</div>
            ) : (
              pageRows.map((row) => <div key={getRowId(row)}>{renderMobileCard(row)}</div>)
            )}
          </div>
        )}

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t bg-muted/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[80px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="size-8"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

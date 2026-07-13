import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Module sub-navigation that scales to any number of tabs without ever clipping.
 * It shows as many tabs as fit the available width and collapses the rest into a
 * "More ▾" dropdown (which highlights when the active tab lives inside it). On
 * narrow / mobile widths the whole bar becomes a single "Jump to…" dropdown.
 *
 * Accepts a flat list of links or labelled groups (or a mix) — groups are
 * flattened into the responsive row, and their labels are kept as section
 * headers inside the "More" menu, so every module drops in unchanged.
 */
export type TabLink = { to: string; label: string; exact?: boolean };
export type TabGroup = { label: string; items: TabLink[] };
export type TabItem = TabLink | TabGroup;

type FlatLink = TabLink & { group?: string };

const isGroup = (t: TabItem): t is TabGroup => "items" in t;

// useLayoutEffect warns during SSR; fall back to useEffect on the server.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const GAP_PX = 4; // matches gap-x-1

const tabClass = (active: boolean) =>
  cn(
    "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1 whitespace-nowrap",
    active
      ? "border-primary text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
  );

export function ModuleTabs({ items }: { items: TabItem[] }) {
  const { pathname } = useLocation();
  const links: FlatLink[] = useMemo(
    () =>
      items.flatMap((it) =>
        isGroup(it) ? it.items.map((l) => ({ ...l, group: it.label })) : [{ ...it }],
      ),
    [items],
  );
  const isActive = (t: TabLink) => (t.exact ? pathname === t.to : pathname.startsWith(t.to));

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(links.length);

  useIsoLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const compute = () => {
      const avail = container.clientWidth;
      const children = Array.from(measure.children) as HTMLElement[];
      if (children.length < links.length + 1) return;
      const moreW = children[children.length - 1].offsetWidth + GAP_PX;
      const tabW = children.slice(0, links.length).map((el) => el.offsetWidth);

      // Everything fits → no "More" needed.
      const totalAll = tabW.reduce((s, w, i) => s + w + (i > 0 ? GAP_PX : 0), 0);
      if (totalAll <= avail) {
        setVisibleCount(links.length);
        return;
      }
      // Otherwise fit as many as possible while reserving room for "More".
      let used = 0;
      let count = 0;
      for (let i = 0; i < tabW.length; i++) {
        used += tabW[i] + (i > 0 ? GAP_PX : 0);
        if (used + moreW <= avail) count += 1;
        else break;
      }
      setVisibleCount(Math.max(1, count));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [links]);

  const visible = links.slice(0, visibleCount);
  const overflow = links.slice(visibleCount);
  const overflowActive = overflow.some(isActive);

  return (
    <div className="mb-6 border-b">
      {/* Mobile: a single "Jump to…" dropdown. */}
      <div className="sm:hidden py-2">
        <JumpDropdown links={links} isActive={isActive} />
      </div>

      {/* Desktop: responsive overflow row. */}
      <div ref={containerRef} className="relative hidden sm:block">
        {/* Invisible measurement copy: every tab + the "More" trigger. */}
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 flex gap-x-1"
        >
          {links.map((t) => (
            <span key={t.to} className={tabClass(false)}>
              {t.label}
            </span>
          ))}
          <span className={tabClass(false)}>
            More <ChevronDown className="size-3.5" />
          </span>
        </div>

        <nav className="flex gap-x-1 overflow-hidden">
          {visible.map((t) => (
            <Link key={t.to} to={t.to} className={tabClass(isActive(t))}>
              {t.label}
            </Link>
          ))}
          {overflow.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className={cn(tabClass(overflowActive), "outline-none")}>
                More
                <ChevronDown className="size-3.5 opacity-60" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {overflow.map((t, i) => {
                  const showHeader = t.group && t.group !== overflow[i - 1]?.group;
                  return (
                    <div key={t.to}>
                      {showHeader && (
                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {t.group}
                        </DropdownMenuLabel>
                      )}
                      <DropdownMenuItem asChild>
                        <Link
                          to={t.to}
                          className={cn(
                            "w-full cursor-pointer",
                            isActive(t) && "text-primary font-medium",
                          )}
                        >
                          {t.label}
                        </Link>
                      </DropdownMenuItem>
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>
      </div>
    </div>
  );
}

function JumpDropdown({
  links,
  isActive,
}: {
  links: FlatLink[];
  isActive: (t: TabLink) => boolean;
}) {
  // Prefer the most specific active link (last match wins).
  const current = [...links].reverse().find(isActive) ?? links[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm font-medium outline-none">
        <span className="truncate">{current?.label ?? "Jump to…"}</span>
        <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[60vh] overflow-y-auto min-w-[var(--radix-dropdown-menu-trigger-width)]"
      >
        {links.map((t, i) => {
          const showHeader = t.group && t.group !== links[i - 1]?.group;
          return (
            <div key={t.to}>
              {showHeader && (
                <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t.group}
                </DropdownMenuLabel>
              )}
              <DropdownMenuItem asChild>
                <Link
                  to={t.to}
                  className={cn("w-full cursor-pointer", isActive(t) && "text-primary font-medium")}
                >
                  {t.label}
                </Link>
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

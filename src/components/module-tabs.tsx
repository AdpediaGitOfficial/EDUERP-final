import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Module sub-navigation that scales past a handful of tabs. Instead of one long
 * horizontally-scrolling bar (where tabs get clipped off-screen), related tabs
 * are collapsed into labelled dropdown groups, so the top-level row stays short
 * and every destination is reachable. Standalone links and groups can be mixed;
 * a group highlights when the active route lives inside it.
 */
export type TabLink = { to: string; label: string; exact?: boolean };
export type TabGroup = { label: string; items: TabLink[] };
export type TabItem = TabLink | TabGroup;

const isGroup = (t: TabItem): t is TabGroup => "items" in t;

const tabClass = (active: boolean) =>
  cn(
    "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1 whitespace-nowrap",
    active
      ? "border-primary text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
  );

export function ModuleTabs({ items }: { items: TabItem[] }) {
  const { pathname } = useLocation();
  const active = (t: TabLink) => (t.exact ? pathname === t.to : pathname.startsWith(t.to));

  return (
    <div className="mb-6 border-b">
      <nav className="flex flex-wrap gap-x-1">
        {items.map((it) => {
          if (!isGroup(it)) {
            return (
              <Link key={it.to} to={it.to} className={tabClass(active(it))}>
                {it.label}
              </Link>
            );
          }
          const groupActive = it.items.some(active);
          return (
            <DropdownMenu key={it.label}>
              <DropdownMenuTrigger className={cn(tabClass(groupActive), "outline-none")}>
                {it.label}
                <ChevronDown className="size-3.5 opacity-60" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                {it.items.map((t) => (
                  <DropdownMenuItem key={t.to} asChild>
                    <Link
                      to={t.to}
                      className={cn("w-full cursor-pointer", active(t) && "text-primary font-medium")}
                    >
                      {t.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </nav>
    </div>
  );
}

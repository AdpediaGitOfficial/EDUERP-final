import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api/client";

type Notification = {
  id: string;
  subject: string | null;
  body: string | null;
  createdAt: string;
  read: boolean;
};

/**
 * Bell + dropdown notification feed. The unread badge polls every 30s; the feed
 * loads when the popover opens. Clicking an unread item (or "Mark all read")
 * marks it read via the API and refreshes the badge.
 */
export function NotificationsBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: unread } = useQuery({
    queryKey: ["notif-unread"],
    queryFn: () => apiGet<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const count = unread?.count ?? 0;

  const { data: items, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiGet<Notification[]>("/notifications?limit=20"),
    enabled: open,
  });

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["notif-unread"] }),
      qc.invalidateQueries({ queryKey: ["notifications"] }),
    ]);

  const markRead = async (id: string) => {
    await apiPost(`/notifications/${id}/read`).catch(() => undefined);
    await refresh();
  };
  const markAll = async () => {
    await apiPost("/notifications/read-all").catch(() => undefined);
    await refresh();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
          className="relative size-11 shrink-0 rounded-lg grid place-items-center hover:bg-secondary text-muted-foreground"
        >
          <Bell className="size-5" />
          {count > 0 && (
            <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold grid place-items-center">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-medium text-sm">Notifications</span>
          {count > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAll}>
              <Check className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-[22rem] overflow-y-auto">
          {isLoading && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          )}
          {!isLoading && (items ?? []).length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              You’re all caught up.
            </p>
          )}
          {(items ?? []).map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              className={`w-full text-left px-4 py-3 border-b last:border-0 hover:bg-secondary/60 transition-colors ${
                n.read ? "opacity-70" : ""
              }`}
            >
              <div className="flex items-start gap-2">
                {!n.read && <span className="mt-1.5 size-2 rounded-full bg-primary shrink-0" />}
                <div className={`min-w-0 ${n.read ? "pl-4" : ""}`}>
                  <div className="text-sm font-medium truncate">{n.subject ?? "Notification"}</div>
                  {n.body && (
                    <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

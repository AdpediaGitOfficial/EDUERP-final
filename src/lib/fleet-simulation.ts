// Deterministic fleet position simulation. Pure function of route + stops + wall clock,
// so admin dashboard and parent view see the same position without any backend loop.
// NO real GPS — clearly labeled at every UI surface that consumes this module.

export type SimStop = {
  id: string;
  name: string;
  sequence: number;
  estimated_minutes: number; // minutes from route start
};

export type SimRoute = {
  id: string;
  name: string;
  vehicle_id: string | null;
  driver_id: string | null;
  stops: SimStop[];
};

export type SimStatus = "on_route" | "at_stop" | "idle" | "off_duty";

export type SimSample = {
  routeId: string;
  status: SimStatus;
  // 0..1 progress along the route
  progress: number;
  // stop currently at or last passed
  currentStop: SimStop | null;
  nextStop: SimStop | null;
  // ETA in minutes to next stop (null when at_stop / off_duty)
  etaMinutesToNextStop: number | null;
  // Deterministic pseudo-position for the mock map
  positionPct: { x: number; y: number };
  minutesSinceStart: number;
  totalRouteMinutes: number;
  operatingWindow: { startHour: number; endHour: number };
};

// Simple deterministic hash for pseudo-positioning on the mock map.
function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Two runs per day: morning pickup and afternoon drop-off.
const AM_START_HOUR = 7;
const PM_START_HOUR = 15; // 3:00 PM
const OP_END_HOUR = 17;

export function simulatePosition(route: SimRoute, now: Date = new Date()): SimSample {
  const stops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
  const total = stops.length ? stops[stops.length - 1].estimated_minutes : 0;
  const noAssign = !route.vehicle_id || !route.driver_id || stops.length < 2;

  const hour = now.getHours();
  const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  // Determine which run (AM/PM) we're in and minutes since its start.
  let runStart = AM_START_HOUR * 60;
  let minutesSinceStart = minutes - runStart;
  if (minutes >= PM_START_HOUR * 60 - 5) {
    runStart = PM_START_HOUR * 60;
    minutesSinceStart = minutes - runStart;
  }

  const inWindow =
    hour >= AM_START_HOUR &&
    hour < OP_END_HOUR &&
    minutesSinceStart >= 0 &&
    minutesSinceStart <= total + 5;

  // Deterministic-but-pretty base position on the mock map.
  const salt = hash(route.id);
  const baseX = 15 + (salt % 60); // 15..75
  const baseY = 20 + ((salt >> 5) % 55); // 20..75

  if (noAssign) {
    return {
      routeId: route.id,
      status: "off_duty",
      progress: 0,
      currentStop: stops[0] ?? null,
      nextStop: null,
      etaMinutesToNextStop: null,
      positionPct: { x: baseX, y: baseY },
      minutesSinceStart: 0,
      totalRouteMinutes: total,
      operatingWindow: { startHour: AM_START_HOUR, endHour: OP_END_HOUR },
    };
  }

  if (!inWindow) {
    return {
      routeId: route.id,
      status: "idle",
      progress: 0,
      currentStop: stops[0] ?? null,
      nextStop: stops[1] ?? null,
      etaMinutesToNextStop: null,
      positionPct: { x: baseX, y: baseY },
      minutesSinceStart: 0,
      totalRouteMinutes: total,
      operatingWindow: { startHour: AM_START_HOUR, endHour: OP_END_HOUR },
    };
  }

  // Locate segment: find last stop whose estimated_minutes <= minutesSinceStart
  let idx = 0;
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].estimated_minutes <= minutesSinceStart) idx = i;
    else break;
  }
  const current = stops[idx];
  const next = stops[idx + 1] ?? null;

  // At-stop window: ±0.5 minute of a scheduled stop
  const distToCurrent = Math.abs(minutesSinceStart - current.estimated_minutes);
  const distToNext = next ? Math.abs(next.estimated_minutes - minutesSinceStart) : Infinity;
  const atStop = distToCurrent <= 0.5 || distToNext <= 0.5;

  const progress = total > 0 ? Math.max(0, Math.min(1, minutesSinceStart / total)) : 0;

  // Position: interpolate along a wavy path segment on the mock map, deterministic per route
  const t = progress;
  const wobble = Math.sin(t * Math.PI * 2 + (salt % 100) / 10) * 8;
  const x = 8 + t * 80 + ((salt % 20) - 10) + (t > 0.5 ? wobble : -wobble);
  const y = baseY + Math.sin(t * Math.PI * 3 + salt) * 10;

  let etaMin: number | null = null;
  if (next) etaMin = Math.max(0, Math.round(next.estimated_minutes - minutesSinceStart));

  return {
    routeId: route.id,
    status: atStop ? "at_stop" : "on_route",
    progress,
    currentStop: current,
    nextStop: next,
    etaMinutesToNextStop: atStop ? 0 : etaMin,
    positionPct: {
      x: Math.max(4, Math.min(92, x)),
      y: Math.max(6, Math.min(90, y)),
    },
    minutesSinceStart: Math.round(minutesSinceStart),
    totalRouteMinutes: total,
    operatingWindow: { startHour: AM_START_HOUR, endHour: OP_END_HOUR },
  };
}

export function statusLabel(s: SimStatus): string {
  return { on_route: "On Route", at_stop: "At Stop", idle: "Idle", off_duty: "Off Duty" }[s];
}

export function statusBadgeClass(s: SimStatus): string {
  return {
    on_route: "bg-emerald-100 text-emerald-800 border-0",
    at_stop: "bg-blue-100 text-blue-800 border-0",
    idle: "bg-amber-100 text-amber-800 border-0",
    off_duty: "bg-slate-200 text-slate-700 border-0",
  }[s];
}

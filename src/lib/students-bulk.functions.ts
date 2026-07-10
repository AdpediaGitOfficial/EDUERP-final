import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const promoteSchema = z.object({
  fromClassId: z.string().uuid(),
  toClassId: z.string().uuid(),
  exclude: z.array(z.string().uuid()).default([]),
});

export const promoteStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => promoteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can promote students.");
    const { data: moved, error } = await context.supabase.rpc("promote_students", {
      p_from_class: data.fromClassId,
      p_to_class: data.toClassId,
      p_exclude: data.exclude,
    });
    if (error) throw new Error(error.message);
    return { moved: Number(moved ?? 0) };
  });

const routeSchema = z.object({
  routeId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()).min(1),
  stopId: z.string().uuid().nullable().optional(),
});

export const bulkAssignRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => routeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can assign transport routes.");
    const rows = data.studentIds.map((sid) => ({
      student_id: sid,
      route_id: data.routeId,
      stop_id: data.stopId ?? null,
    }));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("route_students")
      .upsert(rows, { onConflict: "route_id,student_id" });
    if (error) throw new Error(error.message);
    return { assigned: rows.length };
  });

const statusSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1),
  status: z.enum(["active", "inactive", "alumni"]),
});

export const bulkSetStudentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => statusSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can change student status.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("students")
      .update({ status: data.status })
      .in("id", data.studentIds);
    if (error) throw new Error(error.message);
    return { updated: data.studentIds.length };
  });

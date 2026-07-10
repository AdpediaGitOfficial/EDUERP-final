import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLES = [
  "admin",
  "teacher",
  "student",
  "parent",
  "hr",
  "accountant",
  "reception",
  "fleet_manager",
] as const;

const schema = z.object({
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
  role: z.enum(ROLES),
  phone: z.string().trim().max(30).optional().nullable(),
});

export const createUserByAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only administrators can create users.");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (createErr || !created.user) {
      throw new Error(createErr?.message ?? "Failed to create user");
    }
    const userId = created.user.id;

    try {
      // Ensure profile phone if provided (trigger already inserted the base profile)
      if (data.phone) {
        await supabaseAdmin.from("profiles").update({ phone: data.phone }).eq("id", userId);
      }

      // Force selected role (trigger defaults to 'student'; overwrite for accurate assignment)
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: data.role });
      if (roleErr) throw new Error(roleErr.message);

      if (data.role === "student") {
        const { error: sErr } = await supabaseAdmin.from("students").insert({ profile_id: userId });
        if (sErr) throw new Error(sErr.message);
      } else if (data.role === "teacher") {
        const { error: tErr } = await supabaseAdmin.from("teachers").insert({
          full_name: data.fullName,
          email: data.email,
          phone: data.phone ?? null,
          subject: "General",
          status: "active",
        });
        if (tErr) throw new Error(tErr.message);
      }

      return { ok: true, userId };
    } catch (e) {
      // Roll back the auth user to avoid orphaned accounts
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw e instanceof Error ? e : new Error("Failed to create user");
    }
  });

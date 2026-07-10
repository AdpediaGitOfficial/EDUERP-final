// Regression verification for the Greenwood School ERP (MIGRATION_LOG Phase 8).
// Run from a machine with network access to your Supabase project:
//
//   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node scripts/verify-regression.mjs
//
// (Falls back to VITE_-prefixed vars, so a populated .env + `bun --env-file=.env` works too.)
//
// Checks, in order:
//   1. Three-demo-account identity chain: teacher/parent/student @greenwood.test each sign in,
//      resolve a profile + role, and reach their role-scoped records.
//   2. Seed data integrity (as admin): student count = 5251, class/section count = 100,
//      no duplicate admission numbers, no duplicate roll numbers within a class.
// Exits non-zero on any failure; prints an explicit PASS/FAIL per item.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or VITE_ variants).");
  process.exit(2);
}

const PASSWORD = process.env.DEMO_PASSWORD || "Greenwood@2026";
const EXPECT_STUDENTS = 5251;
const EXPECT_SECTIONS = 100;

let failures = 0;
const report = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const freshClient = () =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn(email) {
  const supabase = freshClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return { supabase, userId: data.user.id };
}

async function checkIdentity(email, expectedRole) {
  try {
    const { supabase, userId } = await signIn(email);
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("full_name,email").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const roleList = (roles ?? []).map((r) => r.role);
    const ok = !!profile?.full_name && roleList.includes(expectedRole);
    report(ok, `identity chain: ${email}`, `profile="${profile?.full_name}", roles=[${roleList}]`);

    if (expectedRole === "parent") {
      const { data: kids } = await supabase
        .from("parent_student")
        .select("student_id, students(id, admission_no, profiles(full_name))")
        .eq("parent_id", userId);
      report(
        (kids ?? []).length > 0,
        "parent → child link resolves",
        `${kids?.length ?? 0} child(ren)`,
      );
    }
    if (expectedRole === "student") {
      const { data: me } = await supabase
        .from("students")
        .select("id, admission_no, class_id")
        .eq("profile_id", userId)
        .maybeSingle();
      report(!!me?.id, "student → own student record resolves", `admission_no=${me?.admission_no}`);
    }
    if (expectedRole === "teacher") {
      const { data: classes } = await supabase
        .from("teacher_classes")
        .select("class_id")
        .eq("teacher_id", userId);
      report(
        (classes ?? []).length > 0,
        "teacher → assigned classes resolve",
        `${classes?.length ?? 0} class(es)`,
      );
    }
    await supabase.auth.signOut();
  } catch (e) {
    report(false, `identity chain: ${email}`, e.message);
  }
}

async function checkSeedIntegrity() {
  try {
    const { supabase } = await signIn("admin@greenwood.test");

    const { count: studentCount } = await supabase
      .from("students")
      .select("id", { count: "exact", head: true });
    report(
      studentCount === EXPECT_STUDENTS,
      `student count = ${EXPECT_STUDENTS}`,
      `got ${studentCount}`,
    );

    const { count: classCount } = await supabase
      .from("classes")
      .select("id", { count: "exact", head: true });
    report(
      classCount === EXPECT_SECTIONS,
      `section count = ${EXPECT_SECTIONS}`,
      `got ${classCount}`,
    );

    // Page through all students to detect duplicates client-side.
    const seenAdmission = new Map();
    const seenRoll = new Map();
    let dupAdmission = 0,
      dupRoll = 0;
    for (let from = 0; from < (studentCount ?? 0); from += 1000) {
      const { data: rows, error } = await supabase
        .from("students")
        .select("admission_no, roll_no, class_id")
        .range(from, from + 999);
      if (error) throw error;
      for (const r of rows ?? []) {
        if (r.admission_no) {
          if (seenAdmission.has(r.admission_no)) dupAdmission++;
          seenAdmission.set(r.admission_no, true);
        }
        const rollKey = `${r.class_id}:${r.roll_no}`;
        if (r.roll_no != null) {
          if (seenRoll.has(rollKey)) dupRoll++;
          seenRoll.set(rollKey, true);
        }
      }
    }
    report(dupAdmission === 0, "no duplicate admission numbers", `${dupAdmission} duplicate(s)`);
    report(dupRoll === 0, "no duplicate roll numbers within a class", `${dupRoll} duplicate(s)`);
    await supabase.auth.signOut();
  } catch (e) {
    report(false, "seed data integrity (admin)", e.message);
  }
}

console.log(`Verifying against ${url}\n`);
await checkIdentity("teacher@greenwood.test", "teacher");
await checkIdentity("parent@greenwood.test", "parent");
await checkIdentity("student@greenwood.test", "student");
await checkSeedIntegrity();

console.log(failures === 0 ? "\nAll regression checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

// Phase-2 student-detail additions: single-student transfer (individual
// promotion) reassigns a collision-free roll in the destination class under the
// per-class advisory lock, and the dashboard exposes class teacher + subjects.
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaExceptionFilter } from "../src/common/filters/prisma-exception.filter";
import { PrismaService } from "../src/infra/database/prisma.service";

const PASSWORD = process.env.DEMO_PASSWORD || "Greenwood@2026";
let app: INestApplication;
let http: any;
let prisma: PrismaService;
const tokens: Record<string, string> = {};
const authed = (m: "get" | "post", path: string, role: string) =>
  request(http)[m](`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

const S = `${process.pid}${(globalThis.performance?.now?.() ?? 0) | 0}`;
let classA = "";
let classB = "";
const cleanup: string[] = [];

beforeAll(async () => {
  process.env.JWT_SECRET ||= "test-secret-not-for-production";
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  await app.init();
  http = app.getHttpServer();
  prisma = app.get(PrismaService);
  for (const [role, e] of [
    ["admin", "admin@greenwood.test"],
    ["teacher", "teacher@greenwood.test"],
  ] as const) {
    const res = await request(http).post("/api/auth/login").send({ email: e, password: PASSWORD });
    tokens[role] = res.body.accessToken;
  }
  // A transfer must stay within the SAME grade (section change only), so pick two
  // sections of one grade rather than the first two arbitrary classes.
  const all = await prisma.classes.findMany({ select: { id: true, name: true } });
  const gradeOf = (n: string | null) => {
    const m = /(\d{1,2})/.exec(n ?? "");
    return m ? m[1] : (n ?? "");
  };
  const byGrade = new Map<string, string[]>();
  for (const c of all) {
    const g = gradeOf(c.name);
    if (!byGrade.has(g)) byGrade.set(g, []);
    byGrade.get(g)!.push(c.id);
  }
  const pair = [...byGrade.values()].find((ids) => ids.length >= 2);
  classA = pair ? pair[0] : all[0].id;
  classB = pair ? pair[1] : (all[1]?.id ?? all[0].id);
});

afterAll(async () => {
  for (const sid of cleanup) {
    const s = await prisma.students.findUnique({
      where: { id: sid },
      select: { profile_id: true },
    });
    await prisma.student_activity_log.deleteMany({ where: { student_id: sid } }).catch(() => {});
    await prisma.student_details.deleteMany({ where: { student_id: sid } }).catch(() => {});
    await prisma.parent_student.deleteMany({ where: { student_id: sid } }).catch(() => {});
    await prisma.fee_assignments.deleteMany({ where: { student_id: sid } }).catch(() => {});
    await prisma.students.delete({ where: { id: sid } }).catch(() => {});
    if (s?.profile_id) {
      await prisma.user_roles.deleteMany({ where: { user_id: s.profile_id } }).catch(() => {});
      await prisma.profiles.delete({ where: { id: s.profile_id } }).catch(() => {});
    }
  }
  await prisma.$executeRaw`DELETE FROM auth.users WHERE email LIKE ${"tr." + "%" + S + "%@student.greenwood.test"}`.catch(
    () => {},
  );
  // Also remove the parent accounts admit() created (trp.<S>.*@p.test) so they
  // don't accumulate across re-runs against the same persistent DB.
  const parentLike = "trp." + S + ".%@p.test";
  await prisma.$executeRaw`DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE ${parentLike})`.catch(
    () => {},
  );
  await prisma.$executeRaw`DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email LIKE ${parentLike})`.catch(
    () => {},
  );
  await prisma.$executeRaw`DELETE FROM auth.users WHERE email LIKE ${parentLike}`.catch(() => {});
  await app?.close();
});

async function admit(cls: string) {
  const email = `trp.${S}.${Math.abs((cls.charCodeAt(0) || 0) + cleanup.length)}@p.test`;
  const r = await authed("post", "/admissions/admit", "admin").send({
    classId: cls,
    firstName: `Tr${S}${cleanup.length}`,
    parentMode: "new",
    father: { name: "F" },
    parentLoginEmail: email,
  });
  if (r.body?.studentId) cleanup.push(r.body.studentId);
  return r;
}

describe("student transfer (individual promotion)", () => {
  it("moves a student to another class with a fresh, collision-free roll", async () => {
    const a = await admit(classA);
    expect(a.status).toBe(201);
    const studentId = a.body.studentId;

    const r = await authed("post", `/students/${studentId}/transfer`, "admin").send({
      toClassId: classB,
    });
    expect(r.status).toBe(201);
    expect(r.body.classId).toBe(classB);
    expect(r.body.rollNo).toMatch(/^\d+$/);

    // The roll must be unique within the destination class.
    const dup = await prisma.students.count({
      where: { class_id: classB, roll_no: r.body.rollNo },
    });
    expect(dup).toBe(1);

    const moved = await prisma.students.findUnique({
      where: { id: studentId },
      select: { class_id: true },
    });
    expect(moved?.class_id).toBe(classB);
  });

  it("rejects a transfer to the same class (400)", async () => {
    const a = await admit(classA);
    const r = await authed("post", `/students/${a.body.studentId}/transfer`, "admin").send({
      toClassId: classA,
    });
    expect(r.status).toBe(400);
  });

  it("a teacher cannot transfer (403)", async () => {
    const a = await admit(classA);
    const r = await authed("post", `/students/${a.body.studentId}/transfer`, "teacher").send({
      toClassId: classB,
    });
    expect(r.status).toBe(403);
  });

  it("dashboard exposes classTeacher and subjects fields", async () => {
    const a = await admit(classA);
    const r = await authed("get", `/students/${a.body.studentId}/dashboard`, "admin");
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("classTeacher");
    expect(Array.isArray(r.body.subjects)).toBe(true);
  });
});

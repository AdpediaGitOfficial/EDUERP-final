// Regression tests for the reported admission bugs:
//  1. Admission#/Roll# "Auto" — GET /admissions/next-numbers generates real values.
//  2. Existing-parent search must find ALL linked guardians, not just parent-role
//     accounts (96% of guardians historically lacked the role and were invisible).
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaExceptionFilter } from "../src/common/filters/prisma-exception.filter";
import { PrismaService } from "../src/infra/database/prisma.service";

const PASSWORD = process.env.DEMO_PASSWORD || "Greenwood@2026";
const ACCOUNTS = { admin: "admin@greenwood.test", teacher: "teacher@greenwood.test" } as const;

let app: INestApplication;
let http: any;
let prisma: PrismaService;
const tokens: Record<string, string> = {};
const authed = (m: "get" | "post", path: string, role: string) =>
  request(http)[m](`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

const stamp = `${process.pid}${(globalThis.performance?.now?.() ?? 0) | 0}`;
let classId = "";
const cleanupStudents: string[] = [];
const cleanupProfiles: string[] = [];

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
  for (const [role, e] of Object.entries(ACCOUNTS)) {
    const res = await request(http).post("/api/auth/login").send({ email: e, password: PASSWORD });
    tokens[role] = res.body.accessToken;
  }
  classId = (await prisma.classes.findFirst({ select: { id: true } }))!.id;
});

afterAll(async () => {
  for (const sid of cleanupStudents) {
    const s = await prisma.students.findUnique({
      where: { id: sid },
      select: { profile_id: true },
    });
    await prisma.students.delete({ where: { id: sid } }).catch(() => {});
    if (s?.profile_id) {
      await prisma.user_roles.deleteMany({ where: { user_id: s.profile_id } }).catch(() => {});
      await prisma.profiles.delete({ where: { id: s.profile_id } }).catch(() => {});
    }
  }
  for (const pid of cleanupProfiles) {
    await prisma.parent_student.deleteMany({ where: { parent_id: pid } }).catch(() => {});
    await prisma.user_roles.deleteMany({ where: { user_id: pid } }).catch(() => {});
    await prisma.profiles.delete({ where: { id: pid } }).catch(() => {});
  }
  await app?.close();
});

describe("admission fix: auto admission/roll numbers", () => {
  it("generates a real admission number and a per-section roll", async () => {
    const res = await authed("get", `/admissions/next-numbers?classId=${classId}`, "admin");
    expect(res.status).toBe(200);
    expect(res.body.admissionNo).toMatch(/^ADM-\d{4}-\d{5}$/);
    expect(res.body.rollNo).toMatch(/^\d+$/);
  });

  it("returns an admission number even without a class (roll null)", async () => {
    const res = await authed("get", `/admissions/next-numbers`, "admin");
    expect(res.status).toBe(200);
    expect(res.body.admissionNo).toBeTruthy();
    expect(res.body.rollNo).toBeNull();
  });

  it("a teacher cannot reserve numbers (403)", async () => {
    expect((await authed("get", `/admissions/next-numbers`, "teacher")).status).toBe(403);
  });
});

describe("admission fix: existing-parent search finds login-less guardians", () => {
  it("a guardian created without a portal login is findable and flagged", async () => {
    // Admit with a new father (portal) + a mother block → mother becomes a
    // login-less guardian (no user_roles parent row).
    const motherName = `MotherFindable ${stamp}`;
    const res = await authed("post", "/admissions/admit", "admin").send({
      classId,
      firstName: "SearchTest",
      lastName: stamp,
      parentMode: "new",
      primaryGuardian: "father",
      father: { name: `Father ${stamp}` },
      mother: { name: motherName, phone: `+9195${stamp.slice(-7)}` },
      parentLoginEmail: `searchdad.${stamp}@parent.test`,
    });
    expect(res.status).toBe(201);
    cleanupStudents.push(res.body.studentId);
    if (res.body.parentId) cleanupProfiles.push(res.body.parentId);

    // The mother has no portal login but IS linked → must appear in search.
    const found = await authed(
      "get",
      `/parents/search?q=${encodeURIComponent(motherName)}`,
      "admin",
    );
    expect(found.status).toBe(200);
    const mother = found.body.matches.find((m: any) => m.fullName === motherName);
    expect(mother).toBeTruthy();
    expect(mother.hasLogin).toBe(false); // guardian, not a portal account
    if (mother) cleanupProfiles.push(mother.id);
  });

  it("still surfaces the portal flag for role-based parents (David)", async () => {
    const res = await authed("get", `/parents/search?q=david.fernandez`, "admin");
    const david = res.body.matches.find((m: any) => m.email === "david.fernandez@family.demo");
    expect(david?.hasLogin).toBe(true);
  });
});

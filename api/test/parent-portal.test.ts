// Parent-portal additions: a child's class timetable and per-child notices feed,
// both authorized through the student scope. Verifies a parent sees their own
// child's data and is blocked (404) from a student that isn't theirs.
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaExceptionFilter } from "../src/common/filters/prisma-exception.filter";
import { PrismaService } from "../src/infra/database/prisma.service";

const PASSWORD = process.env.DEMO_PASSWORD || "Greenwood@2026";
const ACCOUNTS = { admin: "admin@greenwood.test", parent: "parent@greenwood.test" } as const;

let app: INestApplication;
let http: any;
let prisma: PrismaService;
const tokens: Record<string, string> = {};

const authed = (m: "get", path: string, role: string) =>
  request(http)[m](`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

let parentChildId = "";
let otherStudentId = "";

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
  const parent = await prisma.profiles.findFirst({
    where: { email: ACCOUNTS.parent },
    select: { id: true },
  });
  const link = await prisma.parent_student.findFirst({
    where: { parent_id: parent!.id },
    select: { student_id: true },
  });
  parentChildId = link!.student_id;
  const other = await prisma.students.findFirst({
    where: { id: { not: parentChildId }, parent_student: { none: { parent_id: parent!.id } } },
    select: { id: true },
  });
  otherStudentId = other!.id;
}, 40_000);

afterAll(async () => {
  await app?.close();
});

describe("parent portal: class timetable", () => {
  it("admin gets a shaped timetable for a student", async () => {
    const res = await authed("get", `/students/${parentChildId}/timetable`, "admin");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length) {
      const r = res.body[0];
      expect(r).toHaveProperty("dayOfWeek");
      expect(r).toHaveProperty("startTime");
      expect(r).toHaveProperty("subjectName");
    }
  });

  it("a parent gets their own child's timetable", async () => {
    const res = await authed("get", `/students/${parentChildId}/timetable`, "parent");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("a parent is blocked (404) from a student that isn't theirs", async () => {
    const res = await authed("get", `/students/${otherStudentId}/timetable`, "parent");
    expect(res.status).toBe(404);
  });
});

describe("parent portal: notices feed", () => {
  it("returns school-wide / parent / class notices for the child", async () => {
    const res = await authed("get", `/students/${parentChildId}/notices`, "parent");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Every returned notice must be a parent-visible audience.
    for (const n of res.body) {
      expect(["all", "parents", "class"]).toContain(n.audience);
    }
  });

  it("does not leak teacher-only announcements to a parent", async () => {
    const res = await authed("get", `/students/${parentChildId}/notices`, "parent");
    expect(res.body.every((n: any) => n.audience !== "teachers")).toBe(true);
  });

  it("a parent is blocked (404) from another student's notices", async () => {
    const res = await authed("get", `/students/${otherStudentId}/notices`, "parent");
    expect(res.status).toBe(404);
  });
});

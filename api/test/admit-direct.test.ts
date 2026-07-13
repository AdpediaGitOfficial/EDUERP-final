// Direct 5-step admission: atomically creates the student + rich details +
// medical + parent (new deduped or linked) + fee invoices. Verifies the atomic
// side-effects and that a duplicate parent email is rejected (409).
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
let feeId = "";
const createdStudentIds: string[] = [];
const createdProfileIds: string[] = [];

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
  const cls = await prisma.classes.findFirst({ select: { id: true } });
  classId = cls!.id;
  const fee = await prisma.fee_structures.findFirst({ select: { id: true } });
  feeId = fee!.id;
});

afterAll(async () => {
  for (const sid of createdStudentIds) {
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
  for (const pid of createdProfileIds) {
    await prisma.parent_student.deleteMany({ where: { parent_id: pid } }).catch(() => {});
    await prisma.user_roles.deleteMany({ where: { user_id: pid } }).catch(() => {});
    await prisma.profiles.delete({ where: { id: pid } }).catch(() => {});
  }
  await app?.close();
});

describe("direct admission: new parent (atomic)", () => {
  let studentId = "";
  let parentId = "";
  const parentEmail = `admit.parent.${stamp}@parent.test`;

  it("admits a student with a new parent, fees and opening balance in one call", async () => {
    const res = await authed("post", "/admissions/admit", "admin").send({
      classId,
      firstName: "AdmitTest",
      lastName: stamp,
      gender: "male",
      dob: "2020-01-15",
      religion: "Hindu",
      bloodGroup: "B+",
      openingDueBalance: 1200,
      parentMode: "new",
      primaryGuardian: "father",
      father: { name: `Father ${stamp}`, phone: `+9198${stamp.slice(-7)}`, occupation: "Eng" },
      mother: { name: `Mother ${stamp}` },
      parentLoginEmail: parentEmail,
      heightCm: 118,
      weightKg: 22,
      feeGroupIds: [feeId],
    });
    expect(res.status).toBe(201);
    expect(res.body.admissionNo).toMatch(/^ADM-/);
    expect(res.body.rollNo).toBeTruthy();
    expect(res.body.tempPassword).toBeTruthy();
    expect(res.body.parentTempPassword).toBeTruthy();
    studentId = res.body.studentId;
    parentId = res.body.parentId;
    createdStudentIds.push(studentId);
    createdProfileIds.push(parentId);
  });

  it("created the details, medical, 2 guardians and 2 fee invoices", async () => {
    const details = await prisma.student_details.findUnique({ where: { student_id: studentId } });
    expect(details?.religion).toBe("Hindu");
    expect(Number(details?.opening_due_balance)).toBe(1200);
    const medical = await prisma.student_medical.findUnique({ where: { student_id: studentId } });
    expect(medical?.blood_group).toBe("B+");
    expect(Number(medical?.height_cm)).toBe(118);
    const guardians = await prisma.parent_student.count({ where: { student_id: studentId } });
    expect(guardians).toBe(2); // father (primary login) + mother (secondary)
    const fees = await prisma.fee_assignments.count({ where: { student_id: studentId } });
    expect(fees).toBe(2); // selected fee group + opening balance
    // capture the secondary guardian profile for cleanup
    const links = await prisma.parent_student.findMany({
      where: { student_id: studentId },
      select: { parent_id: true },
    });
    for (const l of links) if (l.parent_id !== parentId) createdProfileIds.push(l.parent_id);
  });

  it("rejects a second admission reusing the same parent email (409 dedup)", async () => {
    const res = await authed("post", "/admissions/admit", "admin").send({
      classId,
      firstName: "DupAdmit",
      parentMode: "new",
      primaryGuardian: "father",
      father: { name: "Dup Father" },
      parentLoginEmail: parentEmail,
    });
    expect(res.status).toBe(409);
  });
});

describe("direct admission: RBAC + link existing", () => {
  it("a teacher cannot admit (403)", async () => {
    const res = await authed("post", "/admissions/admit", "teacher").send({
      classId,
      firstName: "Nope",
      parentMode: "new",
      parentLoginEmail: `x${stamp}@x.test`,
      father: { name: "X" },
    });
    expect(res.status).toBe(403);
  });

  it("links an existing parent (David) without creating a new account", async () => {
    const david = await prisma.profiles.findFirst({
      where: { email: "david.fernandez@family.demo" },
      select: { id: true },
    });
    const res = await authed("post", "/admissions/admit", "admin").send({
      classId,
      firstName: "Linked",
      lastName: stamp,
      parentMode: "existing",
      existingParentId: david!.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.parentTempPassword).toBeNull();
    createdStudentIds.push(res.body.studentId);
    const link = await prisma.parent_student.findFirst({
      where: { student_id: res.body.studentId, parent_id: david!.id },
    });
    expect(link).toBeTruthy();
  });
});

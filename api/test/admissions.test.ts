// Full admission workflow: draft -> submit -> advance through the 9 stages ->
// admitted, asserting the enquiry converts into a real student (auto roll),
// links the verified parent, assigns the fee, and notifies the parent. Plus the
// reject path and RBAC. Walks one admission end to end for real.
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaExceptionFilter } from "../src/common/filters/prisma-exception.filter";
import { PrismaService } from "../src/infra/database/prisma.service";

const PASSWORD = process.env.DEMO_PASSWORD || "Greenwood@2026";
const DAVID = "da000000-0000-4000-8000-000000000001";
const ACCOUNTS = { admin: "admin@greenwood.test", teacher: "teacher@greenwood.test" } as const;

let app: INestApplication;
let http: any;
let prisma: PrismaService;
const tokens: Record<string, string> = {};
let classId = "";
let feeStructureId = "";
let createdStudentId = "";
const admissionIds: string[] = [];

const authed = (m: "get" | "post" | "patch", path: string, role: keyof typeof ACCOUNTS = "admin") =>
  request(http)[m](`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

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
  classId = (await authed("get", "/classes")).body[0]?.id;
  const fs = await prisma.fee_structures.findFirst({ select: { id: true } });
  feeStructureId = fs!.id;
}, 30_000);

afterAll(async () => {
  if (createdStudentId) {
    await prisma.fee_assignments
      .deleteMany({ where: { student_id: createdStudentId } })
      .catch(() => {});
    await prisma.parent_student
      .deleteMany({ where: { student_id: createdStudentId } })
      .catch(() => {});
    const st = await prisma.students
      .findUnique({ where: { id: createdStudentId }, select: { profile_id: true } })
      .catch(() => null);
    await prisma.students.delete({ where: { id: createdStudentId } }).catch(() => {});
    if (st?.profile_id) {
      await prisma.profiles.delete({ where: { id: st.profile_id } }).catch(() => {});
      await prisma.users.delete({ where: { id: st.profile_id } }).catch(() => {});
    }
  }
  for (const id of admissionIds)
    await prisma.admission_enquiries.delete({ where: { id } }).catch(() => {});
  await app?.close();
});

describe("admission workflow: RBAC", () => {
  it("a teacher cannot touch admissions", async () => {
    expect((await authed("get", "/admissions", "teacher")).status).toBe(403);
    expect((await authed("post", "/admissions", "teacher").send({ studentName: "X" })).status).toBe(
      403,
    );
  });
});

describe("admission workflow: draft -> admitted", () => {
  let id = "";
  const stamp = `${process.pid}${(globalThis.performance?.now?.() ?? 0) | 0}`;

  it("creates a draft and saves applicant details", async () => {
    const create = await authed("post", "/admissions").send({ studentName: `Wizard Kid ${stamp}` });
    expect(create.status).toBe(201);
    id = create.body.id;
    admissionIds.push(id);
    const save = await authed("patch", `/admissions/${id}`).send({
      gradeApplying: "Grade 1",
      applicantGender: "male",
      previousSchool: "Little School",
      transportRequired: true,
    });
    expect(save.status).toBe(200);
    const got = await authed("get", `/admissions/${id}`);
    expect(got.body.stage).toBe("draft");
    expect(got.body.previousSchool).toBe("Little School");
  });

  it("submit generates an admission number and advances to submitted", async () => {
    const res = await authed("post", `/admissions/${id}/submit`);
    expect(res.status).toBe(201);
    expect(res.body.admissionNo).toMatch(/^ADM-\d{4}-\d{5}$/);
    const got = await authed("get", `/admissions/${id}`);
    expect(got.body.stage).toBe("submitted");
    expect(got.body.history.some((h: any) => h.toStage === "submitted")).toBe(true);
  });

  it("walks the review stages, links a parent, allocates class + fee, then admits", async () => {
    // submitted -> under_review -> document_verification
    await authed("post", `/admissions/${id}/advance`);
    await authed("post", `/admissions/${id}/advance`);
    // link the verified (existing) parent — David
    const link = await authed("post", `/admissions/${id}/parent`).send({ parentId: DAVID });
    expect(link.status).toBe(201);
    // document_verification -> parent_verification
    await authed("post", `/admissions/${id}/advance`);
    // parent_verification -> fee_assignment (assign a fee structure)
    await authed("post", `/admissions/${id}/advance`).send({ feeStructureId });
    // fee_assignment -> class_allocation (assign class + section)
    await authed("post", `/admissions/${id}/advance`).send({ classId, section: "A" });
    // class_allocation -> approved
    const approved = await authed("post", `/admissions/${id}/advance`);
    expect(approved.body.stage).toBe("approved");
    // approved -> admitted (conversion)
    const admitted = await authed("post", `/admissions/${id}/advance`);
    expect(admitted.status).toBe(201);
    expect(admitted.body.stage).toBe("admitted");
    expect(admitted.body.studentId).toBeTruthy();
    createdStudentId = admitted.body.studentId;

    // the student record was created correctly, with a roll number
    const student = await prisma.students.findUnique({ where: { id: createdStudentId } });
    expect(student).not.toBeNull();
    expect(student!.class_id).toBe(classId);
    expect(student!.roll_no).toBeTruthy();
    expect(student!.admission_no).toMatch(/^ADM-\d{4}-\d{5}$/);

    // parent linked as primary + fee responsible
    const link2 = await prisma.parent_student.findFirst({
      where: { student_id: createdStudentId, parent_id: DAVID },
    });
    expect(link2?.is_primary).toBe(true);

    // fee assigned from the chosen structure
    const fee = await prisma.fee_assignments.findFirst({ where: { student_id: createdStudentId } });
    expect(fee).not.toBeNull();

    // the student portal account was provisioned
    const acct = await prisma.users.findUnique({
      where: { id: student!.profile_id! },
      select: { id: true, encrypted_password: true },
    });
    expect(acct).not.toBeNull();
    expect(acct!.encrypted_password).toBeTruthy();

    // the parent was notified of the admission
    const notif = await prisma.broadcast_recipients.count({ where: { user_id: DAVID } });
    expect(notif).toBeGreaterThan(0);

    const got = await authed("get", `/admissions/${id}`);
    expect(got.body.convertedStudentId).toBe(createdStudentId);
  });
});

describe("admission workflow: reject", () => {
  it("rejects a submitted admission with a reason", async () => {
    const stamp = `${process.pid}r${(globalThis.performance?.now?.() ?? 0) | 0}`;
    const create = await authed("post", "/admissions").send({ studentName: `Reject Kid ${stamp}` });
    const rid = create.body.id;
    admissionIds.push(rid);
    await authed("post", `/admissions/${rid}/submit`);
    const noReason = await authed("post", `/admissions/${rid}/reject`).send({ reason: "" });
    expect(noReason.status).toBe(400);
    const rej = await authed("post", `/admissions/${rid}/reject`).send({ reason: "Seats full" });
    expect(rej.status).toBe(201);
    const got = await authed("get", `/admissions/${rid}`);
    expect(got.body.stage).toBe("rejected");
    expect(got.body.rejectionReason).toBe("Seats full");
    // a rejected admission can't advance
    expect((await authed("post", `/admissions/${rid}/advance`)).status).toBe(400);
  });
});

describe("admission workflow: list filters by stage", () => {
  it("filters admissions by stage", async () => {
    const res = await authed("get", "/admissions?stage=admitted&pageSize=5");
    expect(res.status).toBe(200);
    expect(res.body.rows.every((r: any) => r.stage === "admitted")).toBe(true);
  });
});

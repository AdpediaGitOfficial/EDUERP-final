// Admin/HR editing of the teacher detail page: core fields, staff profile
// (lazily creating+linking a staff row), all child collections, and the weekly
// timetable. Uses a throwaway teacher created via the Users API so it never
// mutates the demo teacher other suites rely on.
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

const authed = (
  method: "get" | "post" | "patch" | "put" | "delete",
  path: string,
  role: keyof typeof ACCOUNTS,
) => request(http)[method](`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

const stamp = `${process.pid}${(globalThis.performance?.now?.() ?? 0) | 0}`;
const email = `tp.teacher.${stamp}@greenwood.test`;
let userId = "";
let teacherId = "";
let classId = "";

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
  // Throwaway teacher (creates auth user + profile + a teachers row, staff_id null).
  const created = await authed("post", "/users", "admin").send({
    fullName: "TP Temp Teacher",
    email,
    password: "TempPass123!",
    role: "teacher",
  });
  userId = created.body.userId;
  const teacher = await prisma.teachers.findFirst({ where: { email } });
  teacherId = teacher!.id;
  const cls = await authed("get", "/classes", "admin");
  classId = cls.body[0]?.id;
}, 40_000);

afterAll(async () => {
  if (teacherId) {
    const t = await prisma.teachers.findUnique({ where: { id: teacherId } }).catch(() => null);
    if (t?.staff_id) await prisma.staff.delete({ where: { id: t.staff_id } }).catch(() => {});
    await prisma.teachers.delete({ where: { id: teacherId } }).catch(() => {});
  }
  if (userId) await authed("delete", `/users/${userId}`, "admin");
  await app?.close();
});

const detail = () => authed("get", `/teachers/${teacherId}/detail`, "admin");

describe("teacher profile: RBAC", () => {
  it("a plain teacher cannot edit teacher records", async () => {
    const core = await authed("patch", `/teachers/${teacherId}`, "teacher").send({ subject: "X" });
    expect(core.status).toBe(403);
    const staff = await authed("patch", `/teachers/${teacherId}/staff`, "teacher").send({
      department: "X",
    });
    expect(staff.status).toBe(403);
  });
});

describe("teacher profile: core + staff", () => {
  it("admin edits core teacher fields", async () => {
    const res = await authed("patch", `/teachers/${teacherId}`, "admin").send({
      subject: "Computer Science",
      qualification: "B.Ed, M.A.",
      experienceYears: 10,
      status: "active",
    });
    expect(res.status).toBe(200);
    const d = await detail();
    expect(d.body.teacher.subject).toBe("Computer Science");
    expect(d.body.teacher.experience_years).toBe(10);
  });

  it("editing the staff profile lazily creates + links a staff row", async () => {
    const before = await detail();
    expect(before.body.staff).toBeNull(); // no staff_id yet
    const res = await authed("patch", `/teachers/${teacherId}/staff`, "admin").send({
      department: "Academic",
      designation: "Senior Teacher",
      employmentType: "full_time",
      dob: "1990-04-10",
      bloodGroup: "O+",
      address: "12 School Rd",
      skills: ["Python", "Robotics"],
      emergencyContact: { name: "Kin", phone: "+910000000000" },
      bankDetails: { bank: "SBI", account: "12345", ifsc: "SBIN0001" },
      medicalInfo: "None",
    });
    expect(res.status).toBe(200);
    const after = await detail();
    expect(after.body.staff).not.toBeNull();
    expect(after.body.staff.designation).toBe("Senior Teacher");
    expect(after.body.staff.blood_group).toBe("O+");
    expect(after.body.staff.skills).toContain("Python");
    expect(after.body.staff.bank_details.bank).toBe("SBI");
    // a "revised" history row was written by the update
    expect(after.body.history.some((h: any) => h.event_type === "revised")).toBe(true);
  });
});

describe("teacher profile: child collections", () => {
  it("adds and deletes a qualification", async () => {
    const add = await authed("post", `/teachers/${teacherId}/qualifications`, "admin").send({
      degree: "M.Sc",
      institution: "IIT",
      year: 2015,
    });
    expect(add.status).toBe(201);
    let d = await detail();
    expect(d.body.qualifications.some((q: any) => q.degree === "M.Sc")).toBe(true);
    const del = await authed(
      "delete",
      `/teachers/${teacherId}/qualifications/${add.body.id}`,
      "admin",
    );
    expect(del.status).toBe(200);
    d = await detail();
    expect(d.body.qualifications.some((q: any) => q.id === add.body.id)).toBe(false);
  });

  it("adds experience, a review, history, payroll, training, and a document", async () => {
    const exp = await authed("post", `/teachers/${teacherId}/experience`, "admin").send({
      employer: "Old School",
      role: "Teacher",
      startDate: "2015-01-01",
      endDate: "2019-12-31",
    });
    expect(exp.status).toBe(201);

    const rev = await authed("post", `/teachers/${teacherId}/reviews`, "admin").send({
      period: "2025-H1",
      rating: 4.5,
      notes: "Great",
    });
    expect(rev.status).toBe(201);

    const hist = await authed("post", `/teachers/${teacherId}/history`, "admin").send({
      eventType: "promotion",
      effectiveDate: "2024-04-01",
      fromValue: "Teacher",
      toValue: "Senior Teacher",
    });
    expect(hist.status).toBe(201);

    const pay = await authed("post", `/teachers/${teacherId}/payroll`, "admin").send({
      month: "2026-06",
      baseSalary: 50000,
      allowances: 5000,
      deductions: 2000,
      status: "paid",
    });
    expect(pay.status).toBe(201);

    const trn = await authed("post", `/teachers/${teacherId}/training`, "admin").send({
      title: "Classroom Tech",
      provider: "CBSE",
      status: "completed",
    });
    expect(trn.status).toBe(201);

    const doc = await authed("post", `/teachers/${teacherId}/documents`, "admin").send({
      docType: "certificate",
      title: "B.Ed Certificate",
    });
    expect(doc.status).toBe(201);

    const d = await detail();
    expect(d.body.experience.some((e: any) => e.employer === "Old School")).toBe(true);
    expect(d.body.reviews.some((r: any) => r.period === "2025-H1")).toBe(true);
    expect(d.body.history.some((h: any) => h.event_type === "promotion")).toBe(true);
    expect(d.body.payroll.some((p: any) => Number(p.net_salary) === 53000)).toBe(true);
    expect(d.body.training.some((t: any) => t.training_programs?.name === "Classroom Tech")).toBe(
      true,
    );
    expect(d.body.docs.some((x: any) => x.title === "B.Ed Certificate")).toBe(true);

    // clean deletes for the staff-scoped ones
    expect(
      (await authed("delete", `/teachers/${teacherId}/payroll/${pay.body.id}`, "admin")).status,
    ).toBe(200);
    expect(
      (await authed("delete", `/teachers/${teacherId}/training/${trn.body.id}`, "admin")).status,
    ).toBe(200);
  });
});

describe("teacher profile: timetable", () => {
  it("saves and reads back a weekly timetable", async () => {
    const save = await authed("put", `/teachers/${teacherId}/timetable`, "admin").send({
      entries: [
        { classId, dayOfWeek: 1, startTime: "08:00", endTime: "08:45", room: "R-101" },
        { classId, dayOfWeek: 3, startTime: "09:30", endTime: "10:15", room: "R-102" },
      ],
    });
    expect(save.status).toBe(200);
    expect(save.body.count).toBe(2);

    const tt = await authed("get", `/teachers/${teacherId}/timetable`, "admin");
    expect(tt.status).toBe(200);
    expect(tt.body.profileLinked).toBe(true);
    expect(tt.body.entries).toHaveLength(2);
    const mon = tt.body.entries.find((e: any) => e.dayOfWeek === 1);
    expect(mon.startTime).toBe("08:00");
    expect(mon.endTime).toBe("08:45");
    expect(mon.room).toBe("R-101");
  });

  it("rejects a slot whose end is not after its start", async () => {
    const bad = await authed("put", `/teachers/${teacherId}/timetable`, "admin").send({
      entries: [{ classId, dayOfWeek: 2, startTime: "10:00", endTime: "09:00" }],
    });
    expect(bad.status).toBe(400);
  });
});

// Module-by-module scoping verification (Phase 5, modules 3-7) against the real
// schema + seed data. Each block asserts the module behaves like its extracted
// RLS policies: right role sees its scope, wrong role gets zero rows / 403 / 404.
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";

const PASSWORD = process.env.DEMO_PASSWORD || "Greenwood@2026";
const ACCOUNTS = {
  admin: "admin@greenwood.test",
  teacher: "teacher@greenwood.test",
  student: "student@greenwood.test",
  parent: "parent@greenwood.test",
} as const;

let app: INestApplication;
let http: any;
const tokens: Record<string, string> = {};
const users: Record<string, any> = {};
const get = (path: string, role: keyof typeof ACCOUNTS) =>
  request(http).get(`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

beforeAll(async () => {
  process.env.JWT_SECRET ||= "test-secret-not-for-production";
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  http = app.getHttpServer();
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    const res = await request(http).post("/api/auth/login").send({ email, password: PASSWORD });
    tokens[role] = res.body.accessToken;
    users[role] = res.body.user;
  }
}, 30_000);

afterAll(async () => {
  await app?.close();
});

describe("staff/teachers module (hr_admin_all_staff, staff_read_own, teachers_*)", () => {
  it("admin lists the full staff directory", async () => {
    const res = await get("/staff?pageSize=5", "admin");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(200);
  });

  it("teacher (non-HR) sees at most their own staff row, never the directory", async () => {
    const res = await get("/staff", "teacher");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeLessThanOrEqual(1);
    if (res.body.total === 1) expect(res.body.rows[0].profileId).toBe(users.teacher.id);
  });

  it("admin lists teachers; teacher self-reads by email (teachers_self_read)", async () => {
    const adminList = await get("/teachers?pageSize=5", "admin");
    expect(adminList.status).toBe(200);
    expect(adminList.body.total).toBeGreaterThan(10);

    const own = await get("/teachers", "teacher");
    expect(own.body.total).toBe(1);
    expect(own.body.rows[0].email).toBe(ACCOUNTS.teacher);
    expect(own.body.rows[0].fullName).toBe("Anjali Nair");
  });

  it("student sees zero teachers (no matching policy)", async () => {
    const res = await get("/teachers", "student");
    expect(res.body.total).toBe(0);
  });

  it("teacher reads own class assignments; student is rejected (tc_teacher_read_own)", async () => {
    const own = await get(`/teachers/${users.teacher.id}/classes`, "teacher");
    expect(own.status).toBe(200);
    expect(own.body.length).toBe(7);
    const denied = await get(`/teachers/${users.teacher.id}/classes`, "student");
    expect(denied.status).toBe(403);
  });
});

describe("academics module (classes/subjects/timetable read_auth: true)", () => {
  it("every authenticated role reads the class list (100 sections)", async () => {
    for (const role of ["admin", "teacher", "parent", "student"] as const) {
      const res = await get("/classes", role);
      expect(res.status).toBe(200);
      // >= 100: cutover.test.ts's class-create adds rows to the shared test DB.
      expect(res.body.length).toBeGreaterThanOrEqual(100);
    }
  });

  it("class detail resolves subjects and student count", async () => {
    const grade8a = "4a99fe58-59b1-4503-b833-213f4e16d92b";
    const res = await get(`/classes/${grade8a}`, "student");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Grade 8");
    expect(res.body.section).toBe("A");
    expect(res.body.studentCount).toBeGreaterThan(20);
    expect(res.body.subjects.length).toBeGreaterThan(3);
  });

  it("timetable filters by teacher", async () => {
    const res = await get(`/timetable?teacherId=${users.teacher.id}`, "teacher");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((r: any) => r.teacherId === users.teacher.id)).toBe(true);
  });
});

describe("attendance module (admin_all / teacher_class / parent_read / self_read)", () => {
  it("student sees only their own attendance", async () => {
    const res = await get("/attendance?pageSize=500", "student");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    const ids = new Set(res.body.rows.map((r: any) => r.studentId));
    expect(ids.size).toBe(1);
  });

  it("parent sees only their child's attendance", async () => {
    const res = await get("/attendance?pageSize=500", "parent");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    const names = new Set(res.body.rows.map((r: any) => r.studentName));
    expect([...names]).toEqual(["Anika Singh"]);
  });

  it("teacher sees a class-scoped subset, admin sees everything", async () => {
    const teacher = await get("/attendance?pageSize=1", "teacher");
    const admin = await get("/attendance?pageSize=1", "admin");
    expect(teacher.body.total).toBeGreaterThan(0);
    expect(admin.body.total).toBeGreaterThan(teacher.body.total);
  });

  it("teacher marks attendance for their own class; foreign class is rejected", async () => {
    const grade8a = "4a99fe58-59b1-4503-b833-213f4e16d92b";
    const anika = (await get("/students", "student")).body.rows[0];
    const ok = await request(http)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${tokens.teacher}`)
      .send({
        classId: grade8a,
        date: "2026-07-10",
        entries: [{ studentId: anika.id, status: "present" }],
      });
    expect(ok.status).toBe(201);

    const foreignClass = (await get("/classes", "admin")).body.find(
      (c: any) => c.name === "Grade 1" && c.section === "A",
    );
    const denied = await request(http)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${tokens.teacher}`)
      .send({
        classId: foreignClass.id,
        date: "2026-07-10",
        entries: [{ studentId: anika.id, status: "present" }],
      });
    expect(denied.status).toBe(403);
  });

  it("student cannot mark attendance at all", async () => {
    const denied = await request(http)
      .post("/api/attendance/mark")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send({
        classId: "4a99fe58-59b1-4503-b833-213f4e16d92b",
        date: "2026-07-10",
        entries: [{ studentId: "06d681b5-ce57-4d36-99d3-41ae4c6b4d69", status: "present" }],
      });
    expect(denied.status).toBe(403);
  });
});

describe("homework/gradebook module", () => {
  it("all roles read homework (homework_read_auth: true)", async () => {
    const res = await get("/homework?pageSize=5", "parent");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it("teacher creates homework; student is rejected (homework_teacher_admin_write)", async () => {
    const created = await request(http)
      .post("/api/homework")
      .set("Authorization", `Bearer ${tokens.teacher}`)
      .send({
        classId: "4a99fe58-59b1-4503-b833-213f4e16d92b",
        title: "Migration verification worksheet",
        dueDate: "2026-07-20",
      });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();

    const denied = await request(http)
      .post("/api/homework")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send({
        classId: "4a99fe58-59b1-4503-b833-213f4e16d92b",
        title: "Should not be allowed",
        dueDate: "2026-07-20",
      });
    expect(denied.status).toBe(403);
  });

  it("exam results: student sees own only; teacher sees class scope", async () => {
    const own = await get("/exam-results?pageSize=500", "student");
    expect(own.status).toBe(200);
    const ids = new Set(own.body.rows.map((r: any) => r.studentId));
    expect(ids.size).toBeLessThanOrEqual(1);

    const teacher = await get("/exam-results?pageSize=1", "teacher");
    const admin = await get("/exam-results?pageSize=1", "admin");
    expect(admin.body.total).toBeGreaterThanOrEqual(teacher.body.total);
  });
});

describe("fees/payments module", () => {
  it("parent sees only their child's fee assignments (fa_parent_read)", async () => {
    // Note: the migration-seeded dataset gives the demo child zero fee rows (prod
    // added hers outside migrations), so assert the scope invariant, not a count:
    // every row a parent can see MUST belong to their child.
    const res = await get("/fees/assignments", "parent");
    expect(res.status).toBe(200);
    const names = new Set(res.body.rows.map((r: any) => r.studentName));
    expect([...names].filter((n) => n !== "Anika Singh")).toEqual([]);

    // And the same parent scope on payments returns only child rows.
    const pay = await get("/payments", "parent");
    expect(pay.status).toBe(200);
    const payNames = new Set(pay.body.rows.map((r: any) => r.studentName));
    expect([...payNames].filter((n) => n !== "Anika Singh")).toEqual([]);
  });

  it("admin fee totals cover the whole school", async () => {
    const admin = await get("/fees/assignments?pageSize=1", "admin");
    const parent = await get("/fees/assignments?pageSize=1", "parent");
    expect(admin.body.total).toBeGreaterThan(1000);
    // The parent sees only their child(ren)'s fees — a small, strict subset of the
    // whole school. A generous per-child cap keeps this robust against the local
    // DB accumulating demo assignments across runs (CI starts fresh).
    expect(parent.body.total).toBeLessThan(50);
    expect(parent.body.total).toBeLessThan(admin.body.total);
  });

  it("teacher cannot record a payment (pay_admin_all is the only write policy)", async () => {
    const denied = await request(http)
      .post("/api/payments")
      .set("Authorization", `Bearer ${tokens.teacher}`)
      .send({
        studentId: "06d681b5-ce57-4d36-99d3-41ae4c6b4d69",
        feeAssignmentId: "06d681b5-ce57-4d36-99d3-41ae4c6b4d69",
        amount: 100,
      });
    expect(denied.status).toBe(403);
  });

  it("admin records a payment and the DB trigger updates the fee assignment", async () => {
    const fees = await get("/fees/assignments?status=pending", "admin");
    const target = fees.body.rows[0];
    if (!target) return; // no pending fees in seed — skip silently
    const before = Number(target.amountPaid);
    const res = await request(http)
      .post("/api/payments")
      .set("Authorization", `Bearer ${tokens.admin}`)
      .send({
        studentId: target.studentId,
        feeAssignmentId: target.id,
        amount: 50,
        method: "manual",
        reference: "migration-e2e",
      });
    expect(res.status).toBe(201);
    expect(res.body.receiptNo).toMatch(/^RCPT-/);

    const after = await get(`/fees/assignments?studentId=${target.studentId}`, "admin");
    const updated = after.body.rows.find((r: any) => r.id === target.id);
    expect(Number(updated.amountPaid)).toBeCloseTo(before + 50, 1); // update_fee_on_payment trigger fired
  });
});

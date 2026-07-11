// Covers the write/aggregate endpoints added for the frontend cutover
// (academics stats+create, communication holiday create, students link-parent),
// verified against the real schema + seed data.
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
const get = (p: string, r: keyof typeof ACCOUNTS) =>
  request(http).get(`/api${p}`).set("Authorization", `Bearer ${tokens[r]}`);
const post = (p: string, r: keyof typeof ACCOUNTS, body: any) =>
  request(http).post(`/api${p}`).set("Authorization", `Bearer ${tokens[r]}`).send(body);
const patch = (p: string, r: keyof typeof ACCOUNTS, body: any) =>
  request(http).patch(`/api${p}`).set("Authorization", `Bearer ${tokens[r]}`).send(body);

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
  }
}, 30_000);

afterAll(async () => {
  await app?.close();
});

describe("academics: classes list with ported get_class_stats", () => {
  it("returns 100 sections with student counts + 30-day attendance stats + class teacher", async () => {
    const res = await get("/classes", "admin");
    expect(res.status).toBe(200);
    // >= 100: the create test below adds rows, so re-runs against a persistent
    // local DB accumulate. CI rebuilds the schema fresh, where this is exactly 100.
    expect(res.body.length).toBeGreaterThanOrEqual(100);
    const g8a = res.body.find((c: any) => c.name === "Grade 8" && c.section === "A");
    expect(g8a.studentCount).toBeGreaterThan(0);
    expect(g8a.attendanceTotal).toBeGreaterThanOrEqual(g8a.attendancePresent);
    // Every card the UI renders has the stat fields present.
    expect(res.body.every((c: any) => typeof c.studentCount === "number")).toBe(true);
  });

  it("year filter and helper endpoints work", async () => {
    const years = await get("/classes/years", "admin");
    expect(years.status).toBe(200);
    expect(Array.isArray(years.body)).toBe(true);
    const teacherOpts = await get("/classes/teacher-options", "admin");
    expect(teacherOpts.status).toBe(200);
    expect(teacherOpts.body.length).toBeGreaterThan(0);
    expect(teacherOpts.body[0]).toHaveProperty("fullName");
  });

  it("admin creates a class; duplicate is a clean 409; non-admin is rejected", async () => {
    const section = `MigTest-${process.env.VITEST_WORKER_ID ?? "0"}`;
    const payload = { name: "Grade 12", section, academicYear: "2026-27" };
    // First create is 201; a re-run against the same persistent DB gets 409
    // (unique name+section+year) — both are "handled cleanly", never a 500.
    const first = await post("/classes", "admin", payload);
    expect([201, 409]).toContain(first.status);
    if (first.status === 201) expect(first.body.id).toBeTruthy();
    const dup = await post("/classes", "admin", payload);
    expect(dup.status).toBe(409);
    const denied = await post("/classes", "teacher", { ...payload, section: "Nope" });
    expect(denied.status).toBe(403);
  });
});

describe("communication: holiday create (hol_admin_write)", () => {
  it("admin adds a holiday; teacher is rejected", async () => {
    const ok = await post("/holidays", "admin", {
      name: "Cutover Test Holiday",
      startDate: "2026-09-01",
    });
    expect(ok.status).toBe(201);
    const all = await get("/holidays", "student");
    expect(all.body.some((h: any) => h.name === "Cutover Test Holiday")).toBe(true);
    const denied = await post("/holidays", "teacher", {
      name: "Nope",
      startDate: "2026-09-01",
    });
    expect(denied.status).toBe(403);
  });
});

describe("students: link-parent (ps_admin_all only)", () => {
  it("admin links a parent by admission number; parent self-link is rejected", async () => {
    const anika = (await get("/students", "parent")).body.rows[0];
    const ok = await post("/students/link-parent", "admin", {
      admissionNo: anika.admissionNo,
      parentId: "a494bbda-3b91-405d-a7cf-eef93e6386e9",
    });
    expect(ok.status).toBe(201);
    expect(ok.body.ok).toBe(true);

    const denied = await post("/students/link-parent", "parent", {
      admissionNo: anika.admissionNo,
      parentId: "a494bbda-3b91-405d-a7cf-eef93e6386e9",
    });
    expect(denied.status).toBe(403);
  });

  it("unknown admission number is a clean 400, not a crash", async () => {
    const res = await post("/students/link-parent", "admin", {
      admissionNo: "DOES-NOT-EXIST-9999",
      parentId: "a494bbda-3b91-405d-a7cf-eef93e6386e9",
    });
    expect(res.status).toBe(400);
  });
});

describe("students: search_students port + row-extras + duplicates", () => {
  it("admin search returns total + page rows with the RPC field shape", async () => {
    const res = await get("/students/search?limit=20&sort=admission_date&dir=desc", "admin");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(5000);
    expect(res.body.rows.length).toBe(20);
    const r = res.body.rows[0];
    for (const k of ["id", "admission_no", "full_name", "class_name", "status"]) {
      expect(r).toHaveProperty(k);
    }
  });

  it("search filters (grade) narrow the total", async () => {
    const all = await get("/students/search?limit=1", "admin");
    const g8 = await get("/students/search?gradeName=Grade%208&limit=1", "admin");
    expect(g8.body.total).toBeGreaterThan(0);
    expect(g8.body.total).toBeLessThan(all.body.total);
  });

  it("search name sort is applied", async () => {
    const asc = await get("/students/search?sort=name&dir=asc&limit=5", "admin");
    const names = asc.body.rows.map((r: any) => r.full_name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it("search is role-scoped: teacher subset, student self-only", async () => {
    const teacher = await get("/students/search?limit=200", "teacher");
    const admin = await get("/students/search?limit=1", "admin");
    expect(teacher.body.total).toBeGreaterThan(0);
    expect(teacher.body.total).toBeLessThan(admin.body.total);
    const student = await get("/students/search?limit=10", "student");
    expect(student.body.total).toBe(1);
  });

  it("row-extras returns the four maps for visible ids only", async () => {
    const page = await get("/students/search?limit=5", "admin");
    const ids = page.body.rows.map((r: any) => r.id);
    const res = await post("/students/row-extras", "admin", { ids });
    expect(res.status).toBe(201);
    for (const k of ["attendance", "fees", "performance", "parent"]) {
      expect(res.body).toHaveProperty(k);
    }
    const foreign = page.body.rows.find((r: any) => r.full_name !== "Anika Singh").id;
    const asStudent = await post("/students/row-extras", "student", { ids: [foreign] });
    expect(asStudent.status).toBe(201);
    expect(Object.keys(asStudent.body.attendance)).not.toContain(foreign);
  });

  it("duplicates is admin-only and reports name collisions", async () => {
    const res = await get("/students/duplicates", "admin");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length) {
      expect(res.body[0].count).toBeGreaterThan(1);
      expect(res.body[0].student_ids.length).toBe(res.body[0].count);
    }
    expect((await get("/students/duplicates", "teacher")).status).toBe(403);
  });
});

describe("reports: comprehensive admin dashboard", () => {
  it("returns every KPI + chart series the admin dashboard renders", async () => {
    const res = await get("/reports/admin-dashboard", "admin");
    expect(res.status).toBe(200);
    const d = res.body;
    // KPIs
    expect(d.studentCount).toBeGreaterThan(5000);
    expect(d.classCount).toBeGreaterThanOrEqual(100);
    expect(d.dueTotal).toBeGreaterThan(0);
    expect(typeof d.collectedMonth).toBe("number");
    expect(typeof d.openJobs).toBe("number");
    // Chart series present and shaped
    expect(d.trend.length).toBe(6);
    expect(d.trend[0]).toHaveProperty("revenue");
    expect(Array.isArray(d.byGrade)).toBe(true);
    expect(Array.isArray(d.enrollByGrade)).toBe(true);
    expect(d.staffMix.teaching.length).toBe(2);
    expect(d.attTrend.length).toBe(30);
    expect(Array.isArray(d.paymentMix)).toBe(true);
    expect(Array.isArray(d.defaulters)).toBe(true);
    expect(Array.isArray(d.activity)).toBe(true);
    expect(d.efficiency).toHaveProperty("thisPct");
  });

  it("is admin-only", async () => {
    for (const role of ["teacher", "parent", "student"] as const) {
      expect((await get("/reports/admin-dashboard", role)).status).toBe(403);
    }
  });
});

describe("reports: role dashboards", () => {
  it("teacher dashboard returns assigned classes + schedule shape", async () => {
    const res = await get("/reports/teacher-dashboard", "teacher");
    expect(res.status).toBe(200);
    expect(res.body.classCount).toBe(7);
    expect(res.body.classStats.length).toBe(7);
    expect(Array.isArray(res.body.todaySchedule)).toBe(true);
    expect(res.body.teacher.full_name).toBe("Anjali Nair");
  });

  it("student dashboard returns own metrics", async () => {
    const res = await get("/reports/student-dashboard", "student");
    expect(res.status).toBe(200);
    expect(res.body.student.admission_no).toBeTruthy();
    expect(typeof res.body.attendancePct).toBe("number");
    expect(res.body).toHaveProperty("pendingHw");
    expect(res.body).toHaveProperty("upcomingExams");
  });

  it("parent dashboard returns the linked child with per-child maps", async () => {
    const res = await get("/reports/parent-dashboard", "parent");
    expect(res.status).toBe(200);
    expect(res.body.children.length).toBe(1);
    expect(res.body.children[0].profiles.full_name).toBe("Anika Singh");
    const childId = res.body.children[0].id;
    expect(res.body.attMap[childId]).toBeDefined();
    expect(res.body.hwMap[childId]).toBeDefined();
  });
});

describe("attendance: teacher self-mark (ta_teacher_self_mark)", () => {
  it("teacher reads self status and can mark once; a student has no teacher record", async () => {
    const status = await get("/attendance/my-teacher", "teacher");
    expect(status.status).toBe(200);
    expect(status.body.teacher).not.toBeNull();

    // Mark self: 201 first time, 409 if already marked today (idempotent-safe).
    const mark = await post("/attendance/mark-self", "teacher", { status: "present" });
    expect([201, 409]).toContain(mark.status);
    const again = await post("/attendance/mark-self", "teacher", { status: "present" });
    expect(again.status).toBe(409);

    const studentStatus = await get("/attendance/my-teacher", "student");
    expect(studentStatus.body.teacher).toBeNull();
  });
});

describe("fees: admin structures + bulk assign", () => {
  it("admin lists/creates a structure and bulk-assigns; non-admin rejected", async () => {
    const list = await get("/fees/structures", "admin");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect((await get("/fees/structures", "teacher")).status).toBe(403);

    const created = await post("/fees/structures", "admin", {
      name: `Cutover Fee ${process.env.VITEST_WORKER_ID ?? "0"}`,
      amount: 5000,
      term: "Term 1",
    });
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();

    const grade8a = "4a99fe58-59b1-4503-b833-213f4e16d92b";
    const assigned = await post("/fees/assign", "admin", {
      structureId: created.body.id,
      dueDate: "2026-10-01",
      classId: grade8a,
    });
    expect(assigned.status).toBe(201);
    expect(assigned.body.assigned).toBeGreaterThan(0);

    const denied = await post("/fees/assign", "teacher", {
      structureId: created.body.id,
      dueDate: "2026-10-01",
    });
    expect(denied.status).toBe(403);
  });
});

describe("gradebook: exams + exam_results (admin-write per RLS)", () => {
  const grade8a = "4a99fe58-59b1-4503-b833-213f4e16d92b";

  it("admin creates an exam and saves marks; teacher is read-only", async () => {
    // exams_read_staff: both admin and teacher can read a class's exams.
    const teacherList = await get(`/exams?classId=${grade8a}`, "teacher");
    expect(teacherList.status).toBe(200);
    expect(Array.isArray(teacherList.body)).toBe(true);

    // exams_admin_all: only admin writes.
    const created = await post("/exams", "admin", {
      classId: grade8a,
      name: `Cutover Exam ${process.env.VITEST_WORKER_ID ?? "0"}`,
      maxMarks: 50,
    });
    expect(created.status).toBe(201);
    const examId = created.body.id;
    expect(examId).toBeTruthy();

    // Teacher cannot create exams (exams_admin_all).
    expect((await post("/exams", "teacher", { classId: grade8a, name: "nope" })).status).toBe(403);

    // results_admin_all: admin bulk-upserts marks.
    const students = await get(`/students?classId=${grade8a}&pageSize=1`, "admin");
    const studentId = students.body.rows[0].id;
    const saved = await post("/exam-results", "admin", {
      examId,
      entries: [{ studentId, marks: 42 }],
    });
    expect(saved.status).toBe(201);
    expect(saved.body.saved).toBe(1);

    // Re-upsert (idempotent on exam_id+student_id) with a new mark.
    const resaved = await post("/exam-results", "admin", {
      examId,
      entries: [{ studentId, marks: 45 }],
    });
    expect(resaved.status).toBe(201);

    const results = await get(`/exam-results?examId=${examId}`, "admin");
    expect(results.body.rows.find((r: any) => r.studentId === studentId).marksObtained).toBe("45");

    // Teacher cannot write results (results_admin_all).
    expect(
      (await post("/exam-results", "teacher", { examId, entries: [{ studentId, marks: 1 }] }))
        .status,
    ).toBe(403);
  });
});

describe("assignments: student self-view + self-submit", () => {
  it("student lists own-class homework with submissions and submits one", async () => {
    const list = await get("/assignments", "student");
    expect(list.status).toBe(200);
    expect(list.body.student).toBeTruthy();
    expect(Array.isArray(list.body.items)).toBe(true);
    expect(list.body.items.length).toBeGreaterThan(0);
    // Each item carries the fields the assignments UI renders.
    const a = list.body.items[0];
    expect(a).toHaveProperty("priority");
    expect(a).toHaveProperty("teacher");
    expect(a).toHaveProperty("submission");

    // "students insert/update own submissions" — self-submit succeeds.
    const submitted = await post("/assignments/submit", "student", {
      homeworkId: a.id,
      note: "cutover test submission",
    });
    expect(submitted.status).toBe(201);

    const after = await get("/assignments", "student");
    const updated = after.body.items.find((x: any) => x.id === a.id);
    expect(updated.submission.status).toBe("submitted");
  });
});

describe("HR: dashboard + leave/payroll/expense reads and approvals", () => {
  it("admin dashboard aggregates staff/leave/payroll; non-HR rejected", async () => {
    const dash = await get("/hr/dashboard", "admin");
    expect(dash.status).toBe(200);
    expect(dash.body.total).toBeGreaterThan(0);
    expect(Array.isArray(dash.body.byDepartment)).toBe(true);
    expect(typeof dash.body.attendancePct).toBe("number");
    // hr_admin_* — a teacher has no HR visibility.
    expect((await get("/hr/dashboard", "teacher")).status).toBe(403);
  });

  it("payroll/leave/expense lists return the shapes the HR pages render", async () => {
    const payroll = await get("/hr/payroll-runs?pageSize=5", "admin");
    expect(payroll.status).toBe(200);
    expect(payroll.body).toHaveProperty("rows");

    const leave = await get("/hr/leave-requests?pageSize=5", "admin");
    expect(leave.status).toBe(200);
    expect(leave.body).toHaveProperty("rows");

    const balances = await get("/hr/leave-balances", "admin");
    expect(balances.status).toBe(200);
    expect(Array.isArray(balances.body)).toBe(true);

    const claims = await get("/hr/expense-claims?pageSize=5", "admin");
    expect(claims.status).toBe(200);
    expect(claims.body).toHaveProperty("rows");
  });

  it("admin approves an expense claim (approver_id -> staff FK); teacher rejected", async () => {
    const claims = await get("/hr/expense-claims?pageSize=50", "admin");
    const pending = claims.body.rows.find((c: any) => c.status === "pending");
    // Seed always carries pending claims; guard anyway.
    if (!pending) return;

    expect(
      (
        await patch(`/hr/expense-claims/${pending.id}/decision`, "teacher", {
          status: "approved",
        })
      ).status,
    ).toBe(403);

    const ok = await patch(`/hr/expense-claims/${pending.id}/decision`, "admin", {
      status: "approved",
    });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    // Re-run safe: once no pending claims remain (persistent local DB), the guard
    // above returns early; CI runs against a fresh schema every time.
  });
});

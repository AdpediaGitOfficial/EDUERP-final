// Scoping verification for modules 8-15 (HR, Finance, Library, Fleet, Assets,
// Complaints, Communication, Reports/Audit) against the real schema + seed data.
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
const get = (path: string, role: keyof typeof ACCOUNTS) =>
  request(http).get(`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);
const post = (path: string, role: keyof typeof ACCOUNTS, body: any) =>
  request(http).post(`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`).send(body);

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

describe("HR module (hr_admin_* / staff_read_own_*)", () => {
  it("admin lists all leave requests; teacher sees only their own staff rows", async () => {
    const admin = await get("/hr/leave-requests?pageSize=1", "admin");
    expect(admin.status).toBe(200);
    const teacher = await get("/hr/leave-requests", "teacher");
    expect(teacher.status).toBe(200);
    // The demo teacher may or may not have a staff record; either way the count
    // must be a own-rows subset, never the school-wide list.
    expect(teacher.body.total).toBeLessThanOrEqual(admin.body.total);
  });

  it("student cannot approve a leave request (hr_admin_lr only)", async () => {
    const denied = await request(http)
      .patch("/api/hr/leave-requests/00000000-0000-0000-0000-000000000000/decision")
      .set("Authorization", `Bearer ${tokens.student}`)
      .send({ status: "approved" });
    expect(denied.status).toBe(403);
  });

  it("payroll runs: non-HR roles see own-or-nothing", async () => {
    const admin = await get("/hr/payroll-runs?pageSize=1", "admin");
    const student = await get("/hr/payroll-runs", "student");
    expect(admin.status).toBe(200);
    expect(student.status).toBe(200);
    expect(student.body.total).toBe(0); // students have no staff record
  });
});

describe("Finance module (acc_admin_exp)", () => {
  it("admin reads expenses + ledger; teacher/parent/student are rejected", async () => {
    const admin = await get("/finance/expenses?pageSize=1", "admin");
    expect(admin.status).toBe(200);
    const ledger = await get("/finance/ledger?limit=10", "admin");
    expect(ledger.status).toBe(200);
    for (const role of ["teacher", "parent", "student"] as const) {
      expect((await get("/finance/expenses", role)).status).toBe(403);
      expect((await get("/finance/ledger", role)).status).toBe(403);
    }
  });
});

describe("Library module (lb_read_all / ll_read_self)", () => {
  it("every role reads the catalog", async () => {
    // Note: library_books is empty in the migration-only dataset (prod's catalog
    // was seeded outside migrations) — assert the read RULE, not a row count.
    for (const role of ["admin", "teacher", "parent", "student"] as const) {
      const res = await get("/library/books?pageSize=5", role);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.rows)).toBe(true);
    }
  });

  it("student/parent loans are child/self-scoped subsets of admin's view", async () => {
    const admin = await get("/library/loans?pageSize=1", "admin");
    const student = await get("/library/loans?pageSize=100", "student");
    const parent = await get("/library/loans?pageSize=100", "parent");
    expect(admin.status).toBe(200);
    expect(student.body.total).toBeLessThanOrEqual(admin.body.total);
    expect(parent.body.total).toBeLessThanOrEqual(admin.body.total);
    // teacher has no loan policy branch -> zero rows
    const teacher = await get("/library/loans", "teacher");
    expect(teacher.body.total).toBe(0);
  });

  it("only admin can process a return", async () => {
    const denied = await post(
      "/library/loans/00000000-0000-0000-0000-000000000000/return",
      "teacher",
      {},
    );
    expect(denied.status).toBe(403);
  });
});

describe("Fleet module (fleet_manager|admin ALL; reception read; parent child-route)", () => {
  it("admin reads vehicles/drivers/routes; teacher and student are rejected", async () => {
    expect((await get("/fleet/vehicles", "admin")).status).toBe(200);
    expect((await get("/fleet/drivers", "admin")).status).toBe(200);
    expect((await get("/fleet/routes", "admin")).status).toBe(200);
    for (const role of ["teacher", "student"] as const) {
      expect((await get("/fleet/vehicles", role)).status).toBe(403);
      expect((await get("/fleet/routes", role)).status).toBe(403);
    }
  });

  it("parent sees only routes their child is assigned to", async () => {
    const res = await get("/fleet/routes", "parent");
    expect(res.status).toBe(200);
    const all = await get("/fleet/routes", "admin");
    expect(res.body.length).toBeLessThanOrEqual(all.body.length);
  });
});

describe("Assets module (a_read_staff / aa_admin)", () => {
  it("admin and teacher read assets; parent/student rejected", async () => {
    expect((await get("/assets?pageSize=1", "admin")).status).toBe(200);
    expect((await get("/assets?pageSize=1", "teacher")).status).toBe(200);
    expect((await get("/assets", "parent")).status).toBe(403);
    expect((await get("/assets", "student")).status).toBe(403);
  });

  it("allocations are admin-only", async () => {
    expect((await get("/assets/allocations", "admin")).status).toBe(200);
    expect((await get("/assets/allocations", "teacher")).status).toBe(403);
  });
});

describe("Complaints module (c_admin_all / c_teacher_own / c_parent_read)", () => {
  it("parent files a complaint about their child and sees it; admin sees it too", async () => {
    const kids = await get("/students", "parent");
    const childId = kids.body.rows[0].id;
    const created = await post("/complaints", "parent", {
      studentId: childId,
      subject: "Migration e2e complaint",
      body: "Verifying the complaints scoping end to end.",
    });
    expect(created.status).toBe(201);

    const mine = await get("/complaints", "parent");
    expect(mine.body.rows.some((c: any) => c.id === created.body.id)).toBe(true);

    const admin = await get("/complaints?pageSize=200", "admin");
    expect(admin.body.rows.some((c: any) => c.id === created.body.id)).toBe(true);

    // Teacher (not raiser, not parent of the student) must NOT see it.
    const teacher = await get("/complaints?pageSize=200", "teacher");
    expect(teacher.body.rows.some((c: any) => c.id === created.body.id)).toBe(false);
  });

  it("only admin moves the status workflow", async () => {
    const admin = await get("/complaints?pageSize=1", "admin");
    const id = admin.body.rows[0].id;
    const denied = await request(http)
      .patch(`/api/complaints/${id}/status`)
      .set("Authorization", `Bearer ${tokens.parent}`)
      .send({ status: "resolved" });
    expect(denied.status).toBe(403);
    const ok = await request(http)
      .patch(`/api/complaints/${id}/status`)
      .set("Authorization", `Bearer ${tokens.admin}`)
      .send({ status: "in_review" });
    expect(ok.status).toBe(200);
  });
});

describe("Communication module (ann_audience_read / hol_read_auth)", () => {
  it("audience scoping: student never sees teachers-only announcements", async () => {
    await post("/announcements", "admin", {
      title: "Staff meeting (teachers only)",
      body: "Migration e2e audience check",
      audience: "teachers",
    });
    const student = await get("/announcements?pageSize=200", "student");
    expect(student.status).toBe(200);
    expect(student.body.rows.some((a: any) => a.title === "Staff meeting (teachers only)")).toBe(
      false,
    );
    const teacher = await get("/announcements?pageSize=200", "teacher");
    expect(teacher.body.rows.some((a: any) => a.title === "Staff meeting (teachers only)")).toBe(
      true,
    );
  });

  it("student cannot create announcements (ann_teacher_insert/admin only)", async () => {
    const denied = await post("/announcements", "student", {
      title: "Nope",
      body: "Should be rejected",
    });
    expect(denied.status).toBe(403);
  });

  it("holidays readable by all roles (hol_read_auth: true)", async () => {
    for (const role of ["admin", "teacher", "parent", "student"] as const) {
      const res = await get("/holidays", role);
      expect(res.status).toBe(200);
    }
  });
});

describe("Reports/Audit module", () => {
  it("admin dashboard aggregates real data; other roles rejected", async () => {
    const res = await get("/reports/admin-dashboard", "admin");
    expect(res.status).toBe(200);
    expect(res.body.studentCount).toBeGreaterThan(5000);
    expect(res.body.classCount).toBeGreaterThanOrEqual(100);
    expect(Number(res.body.dueTotal)).toBeGreaterThan(0);
    for (const role of ["teacher", "parent", "student"] as const) {
      expect((await get("/reports/admin-dashboard", role)).status).toBe(403);
    }
  });

  it("audit log is admin-only (pa_admin_read)", async () => {
    expect((await get("/reports/audit-log?pageSize=1", "admin")).status).toBe(200);
    expect((await get("/reports/audit-log", "teacher")).status).toBe(403);
  });
});

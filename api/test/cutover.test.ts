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

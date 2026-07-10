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

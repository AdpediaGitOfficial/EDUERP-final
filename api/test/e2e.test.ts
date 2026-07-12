// End-to-end verification against the REAL schema + seed data (local Postgres built
// from the extracted Supabase migrations — api/db/apply-migrations.sh).
//
// Phase 3 checkpoint: every demo account logs in with its ORIGINAL password
// (migrated bcrypt hashes) and resolves the correct profile + role.
// Phase 4 checkpoint: /students scoping matches the extracted RLS policies —
// wrong role/scope is rejected or sees zero/own rows only, never someone else's.
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

beforeAll(async () => {
  process.env.JWT_SECRET ||= "test-secret-not-for-production";
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  http = app.getHttpServer();
}, 30_000);

afterAll(async () => {
  await app?.close();
});

describe("auth (Phase 3 checkpoint)", () => {
  it.each(Object.entries(ACCOUNTS))(
    "logs in %s with the migrated password hash",
    async (role, email) => {
      const res = await request(http).post("/api/auth/login").send({ email, password: PASSWORD });
      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.user.roles).toContain(role);
      tokens[role] = res.body.accessToken;
      users[role] = res.body.user;
    },
  );

  it("resolves the demo identity chain names", async () => {
    expect(users.teacher.fullName).toBe("Anjali Nair");
    expect(users.student.fullName).toBe("Anika Singh");
    expect(users.parent.fullName).toBe("Priya Singh");
  });

  it("rejects a wrong password", async () => {
    const res = await request(http)
      .post("/api/auth/login")
      .send({ email: ACCOUNTS.admin, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("rejects /auth/me without a token and resolves it with one", async () => {
    expect((await request(http).get("/api/auth/me")).status).toBe(401);
    const res = await request(http)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(ACCOUNTS.teacher);
    expect(res.body.roles).toContain("teacher");
  });

  it("refresh cookie issues a new access token", async () => {
    const login = await request(http)
      .post("/api/auth/login")
      .send({ email: ACCOUNTS.admin, password: PASSWORD });
    const setCookies = login.headers["set-cookie"] as unknown as string[];
    const cookie = setCookies?.find((c) => c.startsWith("erp_refresh="));
    expect(cookie).toBeTruthy();
    const res = await request(http).post("/api/auth/refresh").set("Cookie", cookie!);
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
  });
});

describe("students scoping (Phase 4: RLS -> service-layer translation)", () => {
  it("admin sees the full student body (students_admin_all)", async () => {
    const res = await request(http)
      .get("/api/students?pageSize=1")
      .set("Authorization", `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(500);
  });

  it("teacher sees only students of their assigned classes (students_teacher_read)", async () => {
    const res = await request(http)
      .get("/api/students?pageSize=200")
      .set("Authorization", `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.total).toBeLessThan(1000); // a fraction of 5212, not the whole school
    const classIds = new Set(res.body.rows.map((r: any) => r.class?.id));
    expect(classIds.size).toBeLessThanOrEqual(7); // teacher has 7 assigned classes
  });

  it("parent sees exactly their linked children (students_parent_read)", async () => {
    const res = await request(http)
      .get("/api/students")
      .set("Authorization", `Bearer ${tokens.parent}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].fullName).toBe("Anika Singh");
  });

  it("student sees exactly their own record (students_self_read)", async () => {
    const res = await request(http)
      .get("/api/students")
      .set("Authorization", `Bearer ${tokens.student}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].fullName).toBe("Anika Singh");
  });

  it("student cannot fetch another student's record by id (RLS invisibility)", async () => {
    const other = await request(http)
      .get("/api/students?pageSize=2")
      .set("Authorization", `Bearer ${tokens.admin}`);
    const foreignId = other.body.rows.find((r: any) => r.fullName !== "Anika Singh").id;
    const res = await request(http)
      .get(`/api/students/${foreignId}`)
      .set("Authorization", `Bearer ${tokens.student}`);
    expect(res.status).toBe(404); // invisible, same as RLS — not a data leak, not a 200
  });

  it("parent's child detail includes the guardian link (identity chain)", async () => {
    const list = await request(http)
      .get("/api/students")
      .set("Authorization", `Bearer ${tokens.parent}`);
    const res = await request(http)
      .get(`/api/students/${list.body.rows[0].id}`)
      .set("Authorization", `Bearer ${tokens.parent}`);
    expect(res.status).toBe(200);
    expect(res.body.guardians.map((g: any) => g.fullName)).toContain("Priya Singh");
  });
});

describe("users module scoping", () => {
  it("admin lists users (profiles_admin_all)", async () => {
    const res = await request(http)
      .get("/api/users?pageSize=5")
      .set("Authorization", `Bearer ${tokens.admin}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(500);
    expect(res.body.rows[0].roles).toBeDefined();
  });

  it("teacher is rejected from the admin user directory (no matching policy)", async () => {
    const res = await request(http)
      .get("/api/users")
      .set("Authorization", `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(403);
  });

  it("any role reads its own profile (profiles_self_read)", async () => {
    const res = await request(http)
      .get(`/api/users/${users.student.id}`)
      .set("Authorization", `Bearer ${tokens.student}`);
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Anika Singh");
  });

  it("student cannot read an unrelated profile (no matching policy)", async () => {
    const res = await request(http)
      .get(`/api/users/${users.admin.id}`)
      .set("Authorization", `Bearer ${tokens.student}`);
    expect(res.status).toBe(403);
  });

  it("teacher reads a taught student's profile (profiles_teacher_read_students)", async () => {
    const res = await request(http)
      .get(`/api/users/${users.student.id}`)
      .set("Authorization", `Bearer ${tokens.teacher}`);
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("Anika Singh");
  });
});

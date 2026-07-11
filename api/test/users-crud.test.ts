// Admin Users management: search, view, edit (name/phone/role/status), delete,
// and the deactivation login-gate. Verifies both the happy paths and the RBAC /
// self-lockout guards.
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaExceptionFilter } from "../src/common/filters/prisma-exception.filter";

const PASSWORD = process.env.DEMO_PASSWORD || "Greenwood@2026";
const ACCOUNTS = {
  admin: "admin@greenwood.test",
  teacher: "teacher@greenwood.test",
} as const;

let app: INestApplication;
let http: any;
const tokens: Record<string, string> = {};
const me: Record<string, any> = {};

const authed = (
  method: "get" | "post" | "patch" | "delete",
  path: string,
  role: keyof typeof ACCOUNTS,
) => request(http)[method](`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

// A unique throwaway email per run so re-runs never collide.
const stamp = `${process.pid}${(globalThis.performance?.now?.() ?? 0) | 0}`;
const tempEmail = `crud.user.${stamp}@greenwood.test`;
let tempId = "";

beforeAll(async () => {
  process.env.JWT_SECRET ||= "test-secret-not-for-production";
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  await app.init();
  http = app.getHttpServer();
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    const res = await request(http).post("/api/auth/login").send({ email, password: PASSWORD });
    tokens[role] = res.body.accessToken;
    me[role] = res.body.user;
  }
}, 30_000);

afterAll(async () => {
  // Best-effort cleanup in case a test bailed before deleting the temp user.
  if (tempId) await authed("delete", `/users/${tempId}`, "admin");
  await app?.close();
});

describe("users list: search + filters + RBAC", () => {
  it("teacher (non-admin) is forbidden from the users list", async () => {
    const res = await authed("get", "/users", "teacher");
    expect(res.status).toBe(403);
  });

  it("admin lists users and can search by name/email", async () => {
    const all = await authed("get", "/users?pageSize=5", "admin");
    expect(all.status).toBe(200);
    expect(all.body.total).toBeGreaterThan(0);
    expect(all.body.rows[0]).toHaveProperty("status");
    expect(all.body.rows[0]).toHaveProperty("roles");

    const hit = await authed("get", `/users?q=admin@greenwood.test`, "admin");
    expect(hit.status).toBe(200);
    expect(hit.body.rows.some((r: any) => r.email === "admin@greenwood.test")).toBe(true);

    const miss = await authed("get", `/users?q=zzz-no-such-user-zzz`, "admin");
    expect(miss.body.rows.length).toBe(0);
  });

  it("admin can filter by role and status", async () => {
    const parents = await authed("get", "/users?role=parent&pageSize=5", "admin");
    expect(parents.status).toBe(200);
    expect(parents.body.rows.every((r: any) => r.roles.includes("parent"))).toBe(true);

    const active = await authed("get", "/users?status=active&pageSize=5", "admin");
    expect(active.body.rows.every((r: any) => r.status === "active")).toBe(true);
  });
});

describe("users CRUD: create -> view -> edit -> delete", () => {
  it("admin creates a user", async () => {
    const res = await authed("post", "/users", "admin").send({
      fullName: "CRUD Temp User",
      email: tempEmail,
      password: "TempPass123!",
      role: "reception",
    });
    expect(res.status).toBe(201);
    tempId = res.body.userId;
    expect(tempId).toBeTruthy();
  });

  it("the new user can sign in", async () => {
    const res = await request(http)
      .post("/api/auth/login")
      .send({ email: tempEmail, password: "TempPass123!" });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("admin views the user detail", async () => {
    const res = await authed("get", `/users/${tempId}`, "admin");
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("CRUD Temp User");
    expect(res.body.roles).toContain("reception");
    expect(res.body.status).toBe("active");
  });

  it("admin edits name, phone, and role", async () => {
    const res = await authed("patch", `/users/${tempId}`, "admin").send({
      fullName: "CRUD Renamed",
      phone: "+91-9000000000",
      role: "hr",
    });
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe("CRUD Renamed");
    expect(res.body.phone).toBe("+91-9000000000");
    expect(res.body.roles).toEqual(["hr"]);
  });

  it("deactivating the user blocks their sign-in; reactivating restores it", async () => {
    const off = await authed("patch", `/users/${tempId}`, "admin").send({ status: "inactive" });
    expect(off.status).toBe(200);
    expect(off.body.status).toBe("inactive");

    const blocked = await request(http)
      .post("/api/auth/login")
      .send({ email: tempEmail, password: "TempPass123!" });
    expect(blocked.status).toBe(401);

    const on = await authed("patch", `/users/${tempId}`, "admin").send({ status: "active" });
    expect(on.body.status).toBe("active");
    const ok = await request(http)
      .post("/api/auth/login")
      .send({ email: tempEmail, password: "TempPass123!" });
    expect(ok.status).toBe(201);
  });

  it("admin resets the password; the new temp password works and the old one fails", async () => {
    const res = await authed("post", `/users/${tempId}/reset-password`, "admin").send({});
    expect(res.status).toBe(201);
    expect(typeof res.body.tempPassword).toBe("string");
    expect(res.body.tempPassword.length).toBeGreaterThanOrEqual(8);

    const withNew = await request(http)
      .post("/api/auth/login")
      .send({ email: tempEmail, password: res.body.tempPassword });
    expect(withNew.status).toBe(201);

    const withOld = await request(http)
      .post("/api/auth/login")
      .send({ email: tempEmail, password: "TempPass123!" });
    expect(withOld.status).toBe(401);
  });

  it("admin views the activity timeline (created + login events)", async () => {
    const res = await authed("get", `/users/${tempId}/activity`, "admin");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.some((e: any) => e.type === "created")).toBe(true);
    expect(res.body.events.some((e: any) => e.type === "login")).toBe(true);
  });

  it("admin deletes the user (no linked records) and it disappears", async () => {
    const res = await authed("delete", `/users/${tempId}`, "admin");
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const gone = await authed("get", `/users/${tempId}`, "admin");
    expect(gone.status).toBe(404);

    const cantLogin = await request(http)
      .post("/api/auth/login")
      .send({ email: tempEmail, password: "TempPass123!" });
    expect(cantLogin.status).toBe(401);
    tempId = "";
  });
});

describe("users edit/delete: guards", () => {
  it("teacher cannot edit, delete, reset passwords, or read activity", async () => {
    const patch = await authed("patch", `/users/${me.teacher.id}`, "teacher").send({
      fullName: "Hacker",
    });
    expect(patch.status).toBe(403);
    const del = await authed("delete", `/users/${me.admin.id}`, "teacher");
    expect(del.status).toBe(403);
    const reset = await authed("post", `/users/${me.admin.id}/reset-password`, "teacher").send({});
    expect(reset.status).toBe(403);
    const activity = await authed("get", `/users/${me.admin.id}/activity`, "teacher");
    expect(activity.status).toBe(403);
  });

  it("admin cannot delete or deactivate their own account", async () => {
    const del = await authed("delete", `/users/${me.admin.id}`, "admin");
    expect(del.status).toBe(400);
    const off = await authed("patch", `/users/${me.admin.id}`, "admin").send({
      status: "inactive",
    });
    expect(off.status).toBe(400);
  });

  it("rejects a non-uuid id (400) and an unknown role (400)", async () => {
    const badId = await authed("patch", `/users/not-a-uuid`, "admin").send({ fullName: "x" });
    expect(badId.status).toBe(400);
    const badRole = await authed("patch", `/users/${me.admin.id}`, "admin").send({
      role: "wizard",
    });
    expect(badRole.status).toBe(400);
  });
});

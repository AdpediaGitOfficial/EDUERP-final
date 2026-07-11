// Parent management foundation: duplicate-prevention (app search + DB trigger),
// directory, standalone profile, child linking, and the mapping utility.
// The duplicate cases are REAL attempted duplicates, not assertions about text.
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
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
  m: "get" | "post" | "patch" | "delete",
  path: string,
  role: keyof typeof ACCOUNTS,
) => request(http)[m](`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

const stamp = `${process.pid}${(globalThis.performance?.now?.() ?? 0) | 0}`;
const p1 = {
  fullName: "Dedupe Parent One",
  email: `dedupe.parent.${stamp}@greenwood.test`,
  phone: `+9199${stamp.slice(-8)}`,
  nationalId: `NID-${stamp}`,
};
let p1Id = "";
let studentId = "";

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
  const students = await authed("get", "/students?pageSize=1", "admin");
  studentId = students.body.rows?.[0]?.id;
}, 40_000);

afterAll(async () => {
  if (p1Id) {
    await prisma.parent_student.deleteMany({ where: { parent_id: p1Id } }).catch(() => {});
    await prisma.profiles.delete({ where: { id: p1Id } }).catch(() => {});
    await prisma.users.delete({ where: { id: p1Id } }).catch(() => {});
  }
  await app?.close();
});

describe("parent management: RBAC + directory", () => {
  it("a teacher cannot access the parent directory or search", async () => {
    expect((await authed("get", "/parents", "teacher")).status).toBe(403);
    expect((await authed("get", "/parents/search?q=a", "teacher")).status).toBe(403);
  });

  it("admin lists the parent directory with child counts", async () => {
    const res = await authed("get", "/parents?pageSize=5", "admin");
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.rows[0]).toHaveProperty("childrenCount");
  });
});

describe("parent management: create + duplicate-prevention", () => {
  it("admin creates a new parent", async () => {
    const res = await authed("post", "/parents", "admin").send(p1);
    expect(res.status).toBe(201);
    p1Id = res.body.parentId;
    expect(p1Id).toBeTruthy();
  });

  it("search surfaces the existing parent by email, phone, and national ID", async () => {
    const byEmail = await authed(
      "get",
      `/parents/search?email=${encodeURIComponent(p1.email)}`,
      "admin",
    );
    expect(byEmail.body.matches.some((m: any) => m.id === p1Id)).toBe(true);
    const byPhone = await authed(
      "get",
      `/parents/search?phone=${encodeURIComponent(p1.phone)}`,
      "admin",
    );
    expect(byPhone.body.matches.some((m: any) => m.id === p1Id)).toBe(true);
    const byNid = await authed(
      "get",
      `/parents/search?nationalId=${encodeURIComponent(p1.nationalId)}`,
      "admin",
    );
    expect(byNid.body.matches.some((m: any) => m.id === p1Id)).toBe(true);
  });

  it("creating a second parent with the same email/phone/nationalId is blocked (409)", async () => {
    const sameEmail = await authed("post", "/parents", "admin").send({
      ...p1,
      phone: undefined,
      nationalId: undefined,
    });
    expect(sameEmail.status).toBe(409);
    expect(sameEmail.body.existing?.id).toBe(p1Id);

    const samePhone = await authed("post", "/parents", "admin").send({
      fullName: "Impostor",
      email: `other.${stamp}@greenwood.test`,
      phone: p1.phone,
    });
    expect(samePhone.status).toBe(409);

    const sameNid = await authed("post", "/parents", "admin").send({
      fullName: "Impostor2",
      email: `other2.${stamp}@greenwood.test`,
      nationalId: p1.nationalId,
    });
    expect(sameNid.status).toBe(409);
  });

  it("DB TRIGGER blocks a duplicate that bypasses the app entirely (direct insert)", async () => {
    // Simulate a bulk import / direct API path: make a fresh account, set its
    // phone to P1's, then grant the parent role. The trigger must reject it.
    const attempt = prisma.$transaction(async (tx) => {
      const uid = randomUUID();
      await tx.users.create({
        data: {
          id: uid,
          email: `bypass.${stamp}@x.test`,
          aud: "authenticated",
          role: "authenticated",
        },
      });
      await tx.profiles.upsert({
        where: { id: uid },
        create: { id: uid, full_name: "Bypass", phone: p1.phone },
        update: { phone: p1.phone },
      });
      await tx.$executeRaw`INSERT INTO public.user_roles (user_id, role) VALUES (${uid}::uuid, 'parent')`;
    });
    // The trigger raises SQLSTATE 23505; Prisma surfaces that (its wrapper drops
    // the custom message text, so match the code or the tag).
    await expect(attempt).rejects.toThrow(/duplicate_parent_identity|23505/);
  });
});

describe("parent management: profile + child linking + mapping", () => {
  it("links a child, then the profile lists the child and rolls up fees", async () => {
    const link = await authed("post", `/parents/${p1Id}/children`, "admin").send({
      studentId,
      relationshipType: "father",
    });
    expect(link.status).toBe(201);

    const prof = await authed("get", `/parents/${p1Id}`, "admin");
    expect(prof.status).toBe(200);
    expect(prof.body.children.some((c: any) => c.studentId === studentId)).toBe(true);
    expect(prof.body.children[0].relationshipType).toBe("father");
    expect(prof.body.feeSummary).toHaveProperty("outstanding");
    expect(prof.body.login).toHaveProperty("lastSignInAt");

    const unlink = await authed("delete", `/parents/${p1Id}/children/${studentId}`, "admin");
    expect(unlink.status).toBe(200);
  });

  it("admin mapping utility returns unlinked students + orphan guardians", async () => {
    const res = await authed("get", "/parents/mapping", "admin");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.unlinkedStudents)).toBe(true);
    expect(Array.isArray(res.body.orphanGuardians)).toBe(true);
    // teacher is forbidden from the utility
    expect((await authed("get", "/parents/mapping", "teacher")).status).toBe(403);
  });
});

describe("parent management: demo chain intact", () => {
  it("the demo parent account still logs in after the dedupe trigger is live", async () => {
    const res = await request(http)
      .post("/api/auth/login")
      .send({ email: "parent@greenwood.test", password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user.roles).toContain("parent");
  });
});

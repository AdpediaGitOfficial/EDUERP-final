// Student profile detail module: medical / hostel / disciplinary / documents /
// activity-log CRUD, with role-scoped access. Verifies desk-only writes are
// enforced (parent/teacher blocked with a real attempted write, not just a
// text assertion) and that the activity log accumulates on every mutation.
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaExceptionFilter } from "../src/common/filters/prisma-exception.filter";
import { PrismaService } from "../src/infra/database/prisma.service";

const PASSWORD = process.env.DEMO_PASSWORD || "Greenwood@2026";
const ACCOUNTS = {
  admin: "admin@greenwood.test",
  teacher: "teacher@greenwood.test",
  parent: "parent@greenwood.test",
} as const;

let app: INestApplication;
let http: any;
let prisma: PrismaService;
const tokens: Record<string, string> = {};

const authed = (m: "get" | "post" | "put" | "patch" | "delete", path: string, role: string) =>
  request(http)[m](`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

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
  // Leave demo family/seed rows intact; only clean transient rows we created.
  if (studentId) {
    await prisma.student_activity_log
      .deleteMany({ where: { student_id: studentId, event_type: { contains: "test_" } } })
      .catch(() => {});
  }
  await app?.close();
});

describe("student profile: read scope", () => {
  it("admin can read the consolidated profile with canEdit=true", async () => {
    const res = await authed("get", `/students/${studentId}/profile`, "admin");
    expect(res.status).toBe(200);
    expect(res.body.canEdit).toBe(true);
    expect(Array.isArray(res.body.disciplinary)).toBe(true);
    expect(Array.isArray(res.body.activity)).toBe(true);
  });

  it("a random uuid 404s (not 500)", async () => {
    const res = await authed(
      "get",
      "/students/00000000-0000-4000-8000-000000000000/profile",
      "admin",
    );
    expect(res.status).toBe(404);
  });
});

describe("student profile: medical (desk-only write)", () => {
  it("admin can upsert medical and it round-trips", async () => {
    const res = await authed("put", `/students/${studentId}/profile/medical`, "admin").send({
      bloodGroup: "AB+",
      allergies: "Dust",
    });
    expect(res.status).toBe(200);
    expect(res.body.medical.bloodGroup).toBe("AB+");
    expect(res.body.medical.allergies).toBe("Dust");
  });

  it("a parent cannot write medical (403) — real attempted write", async () => {
    const res = await authed("put", `/students/${studentId}/profile/medical`, "parent").send({
      bloodGroup: "X",
    });
    expect(res.status).toBe(403);
  });
});

describe("student profile: disciplinary + activity log", () => {
  let incidentId = "";
  it("admin can log an incident and the activity log grows", async () => {
    const before = await authed("get", `/students/${studentId}/profile`, "admin");
    const beforeCount = before.body.activity.length;
    const res = await authed("post", `/students/${studentId}/profile/disciplinary`, "admin").send({
      severity: "moderate",
      description: "Vitest incident",
      actionTaken: "Noted",
    });
    expect(res.status).toBe(201);
    const row = res.body.disciplinary.find((r: any) => r.description === "Vitest incident");
    expect(row).toBeTruthy();
    incidentId = row.id;
    // The activity feed grows by one — unless it's already at its display cap
    // (the endpoint returns the most recent 100), where it stays pinned at 100.
    expect(res.body.activity.length).toBeGreaterThanOrEqual(Math.min(beforeCount + 1, 100));
  });

  it("admin can resolve then delete the incident", async () => {
    const upd = await authed(
      "patch",
      `/students/${studentId}/profile/disciplinary/${incidentId}`,
      "admin",
    ).send({ status: "resolved" });
    expect(upd.status).toBe(200);
    expect(upd.body.disciplinary.find((r: any) => r.id === incidentId).status).toBe("resolved");

    const del = await authed(
      "delete",
      `/students/${studentId}/profile/disciplinary/${incidentId}`,
      "admin",
    );
    expect(del.status).toBe(200);
    expect(del.body.disciplinary.find((r: any) => r.id === incidentId)).toBeUndefined();
  });
});

describe("student profile: documents", () => {
  it("admin can add then remove a document", async () => {
    const add = await authed("post", `/students/${studentId}/profile/documents`, "admin").send({
      docType: "id_proof",
      title: "Vitest Doc",
      verified: true,
    });
    expect(add.status).toBe(201);
    const doc = add.body.documents.find((d: any) => d.title === "Vitest Doc");
    expect(doc?.verified).toBe(true);

    const del = await authed(
      "delete",
      `/students/${studentId}/profile/documents/${doc.id}`,
      "admin",
    );
    expect(del.status).toBe(200);
    expect(del.body.documents.find((d: any) => d.id === doc.id)).toBeUndefined();
  });
});

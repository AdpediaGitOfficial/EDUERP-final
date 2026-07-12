// SIS consolidated profile: header + fee summary + behavior score + siblings +
// credentials, plus the send-pass (regenerate + notify) action. Uses the seeded
// Fernandez family (Liam has two siblings; David is the linked parent).
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
const LIAM = "de000000-0000-4000-8000-000000000001";

let app: INestApplication;
let http: any;
let prisma: PrismaService;
const tokens: Record<string, string> = {};
const authed = (m: "get" | "post", path: string, role: string) =>
  request(http)[m](`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

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
}, 40_000);

afterAll(async () => {
  await app?.close();
});

describe("SIS profile: consolidated read", () => {
  it("returns header, fee summary, siblings, guardians and credentials", async () => {
    const res = await authed("get", `/students/${LIAM}/profile/sis`, "admin");
    expect(res.status).toBe(200);
    expect(res.body.header.admissionNo).toBeTruthy();
    expect(res.body.feeSummary).toHaveProperty("balance");
    expect(res.body.siblings.length).toBeGreaterThanOrEqual(2); // Sofia + Mateo
    expect(res.body.guardians.length).toBeGreaterThanOrEqual(1);
    expect(res.body.credentials.studentUsername).toBeTruthy();
  });

  it("behavior score = positive − concern (needs_improvement)", async () => {
    const res = await authed("get", `/students/${LIAM}/profile/sis`, "admin");
    const b = res.body.behavior;
    expect(b.score).toBe(b.positive - b.concern);
  });

  it("credentials never expose a stored password", async () => {
    const res = await authed("get", `/students/${LIAM}/profile/sis`, "admin");
    const cred = JSON.stringify(res.body.credentials).toLowerCase();
    expect(cred).not.toContain("password");
  });
});

describe("SIS profile: send-pass", () => {
  it("a teacher cannot send a pass (403)", async () => {
    const res = await authed("post", `/students/${LIAM}/profile/send-pass`, "teacher").send({
      target: "student",
    });
    expect(res.status).toBe(403);
  });

  it("admin regenerates the STUDENT pass and gets a one-time password back", async () => {
    const res = await authed("post", `/students/${LIAM}/profile/send-pass`, "admin").send({
      target: "student",
    });
    expect(res.status).toBe(201);
    expect(res.body.tempPassword).toBeTruthy();
    expect(res.body.target).toBe("student");
    // The new password actually works for the student login.
    const email = (
      await prisma.students.findUnique({
        where: { id: LIAM },
        select: { profiles: { select: { email: true } } },
      })
    )?.profiles?.email;
    if (email) {
      const login = await request(http)
        .post("/api/auth/login")
        .send({ email, password: res.body.tempPassword });
      expect(login.status).toBe(201);
    }
  });
});

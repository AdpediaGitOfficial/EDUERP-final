// SIS master data: student categories + custom-field definitions. Admin-managed
// reference data with case-insensitive name uniqueness and in-use delete guards.
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

let app: INestApplication;
let http: any;
let prisma: PrismaService;
const tokens: Record<string, string> = {};
const authed = (m: "get" | "post" | "patch" | "delete", path: string, role: string) =>
  request(http)[m](`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

const stamp = `${process.pid}${(globalThis.performance?.now?.() ?? 0) | 0}`;
const createdCatIds: string[] = [];
const createdFieldIds: string[] = [];

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
  for (const id of createdFieldIds)
    await prisma.student_custom_fields.delete({ where: { id } }).catch(() => {});
  for (const id of createdCatIds)
    await prisma.student_categories.delete({ where: { id } }).catch(() => {});
  await app?.close();
});

describe("SIS: student categories", () => {
  it("ships the seeded government categories", async () => {
    const res = await authed("get", "/sis/categories", "admin");
    expect(res.status).toBe(200);
    const names = res.body.map((c: any) => c.name);
    expect(names).toEqual(expect.arrayContaining(["General", "SC", "ST", "OBC"]));
  });

  it("a teacher cannot read or write categories", async () => {
    expect((await authed("get", "/sis/categories", "teacher")).status).toBe(403);
    expect((await authed("post", "/sis/categories", "teacher").send({ name: "X" })).status).toBe(403);
  });

  it("admin creates a category and duplicate names (case-insensitive) 409", async () => {
    const name = `Cat ${stamp}`;
    const created = await authed("post", "/sis/categories", "admin").send({ name });
    expect(created.status).toBe(201);
    createdCatIds.push(created.body.id);
    const dup = await authed("post", "/sis/categories", "admin").send({ name: name.toUpperCase() });
    expect(dup.status).toBe(409);
  });
});

describe("SIS: custom fields", () => {
  it("admin creates a dropdown field with options", async () => {
    const created = await authed("post", "/sis/custom-fields", "admin").send({
      label: `Field ${stamp}`,
      fieldType: "dropdown",
      options: ["A", "B", "C"],
    });
    expect(created.status).toBe(201);
    expect(created.body.fieldType).toBe("dropdown");
    expect(created.body.options).toEqual(["A", "B", "C"]);
    createdFieldIds.push(created.body.id);
  });

  it("a text field drops any options", async () => {
    const created = await authed("post", "/sis/custom-fields", "admin").send({
      label: `Text ${stamp}`,
      fieldType: "text",
      options: ["ignored"],
    });
    expect(created.status).toBe(201);
    expect(created.body.options).toEqual([]);
    createdFieldIds.push(created.body.id);
  });

  it("active-only listing excludes deactivated fields", async () => {
    const id = createdFieldIds[0];
    await authed("patch", `/sis/custom-fields/${id}`, "admin").send({ active: false });
    const activeOnly = await authed("get", "/sis/custom-fields", "admin");
    expect(activeOnly.body.find((f: any) => f.id === id)).toBeUndefined();
    const all = await authed("get", "/sis/custom-fields?includeInactive=true", "admin");
    expect(all.body.find((f: any) => f.id === id)).toBeTruthy();
  });
});

// Student–parent model: admission-time parent search (mobile/passport/parent
// code), the sibling scenario (2nd child reuses the parent — new mapping row,
// NO new parent), guardian flags on the student, roll-number uniqueness, and
// the demo chain staying intact. The sibling case is exercised for real.
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, type INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { PrismaExceptionFilter } from "../src/common/filters/prisma-exception.filter";
import { PrismaService } from "../src/infra/database/prisma.service";

const PASSWORD = process.env.DEMO_PASSWORD || "Greenwood@2026";
const DAVID = "da000000-0000-4000-8000-000000000001";
const SIB = [
  "de000000-0000-4000-8000-000000000001",
  "de000000-0000-4000-8000-000000000002",
  "de000000-0000-4000-8000-000000000003",
];

let app: INestApplication;
let http: any;
let prisma: PrismaService;
let adminTok = "";

const authed = (m: "get" | "post" | "delete", path: string) =>
  request(http)[m](`/api${path}`).set("Authorization", `Bearer ${adminTok}`);

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
  const res = await request(http)
    .post("/api/auth/login")
    .send({ email: "admin@greenwood.test", password: PASSWORD });
  adminTok = res.body.accessToken;
}, 30_000);

afterAll(async () => {
  await app?.close();
});

describe("admission-time parent search", () => {
  it("finds the seeded parent by mobile, passport-less national ID, and parent code", async () => {
    const byMobile = await authed(
      "get",
      `/parents/search?phone=${encodeURIComponent("+91 90000 10001")}`,
    );
    expect(byMobile.body.matches.some((m: any) => m.id === DAVID)).toBe(true);
    // parent code
    const byCode = await authed("get", `/parents/search?parentCode=PAR-DAVID001`);
    expect(byCode.body.matches.some((m: any) => m.id === DAVID)).toBe(true);
    // national id
    const byNid = await authed("get", `/parents/search?nationalId=NID-DAVID-001`);
    expect(byNid.body.matches.some((m: any) => m.id === DAVID)).toBe(true);
    // the match carries the parent's already-linked children (3 siblings)
    const david = byMobile.body.matches.find((m: any) => m.id === DAVID);
    expect(david.children.length).toBeGreaterThanOrEqual(3);
  });

  it("searching by passport finds a parent given one", async () => {
    // give David a passport, then search by it
    await authed("get", `/parents/${DAVID}`); // ensure reachable
    await prisma.profiles.update({ where: { id: DAVID }, data: { passport_no: "P1234567" } });
    const res = await authed("get", `/parents/search?passportNo=P1234567`);
    expect(res.body.matches.some((m: any) => m.id === DAVID)).toBe(true);
  });
});

describe("sibling scenario: reuse parent, no duplicate", () => {
  it("David is linked to all 3 siblings but exists as exactly one parent record", async () => {
    const prof = await authed("get", `/parents/${DAVID}`);
    const linkedIds = prof.body.children.map((c: any) => c.studentId).sort();
    for (const s of SIB) expect(linkedIds).toContain(s);

    // Exactly one parent profile carries David's identity (no duplicate).
    const dupCount = await prisma.profiles.count({
      where: { OR: [{ email: "david.fernandez@family.demo" }, { national_id: "NID-DAVID-001" }] },
    });
    expect(dupCount).toBe(1);
  });

  it("linking the parent to a fresh sibling adds ONE mapping row, not a new parent", async () => {
    // Admit a brand-new sibling, then link the EXISTING parent (as a real
    // second-child admission would after search finds him).
    const stamp = `${process.pid}${(globalThis.performance?.now?.() ?? 0) | 0}`;
    const admit = await authed("post", "/students/admit").send({
      fullName: "Ava Fernandez",
      email: `ava.${stamp}@student.demo`,
    });
    expect(admit.status).toBe(201);
    const newStudent = await prisma.students.findFirst({
      where: { profiles: { email: `ava.${stamp}@student.demo` } },
      select: { id: true },
    });

    const parentsBefore = await prisma.profiles.count({
      where: { OR: [{ email: "david.fernandez@family.demo" }, { national_id: "NID-DAVID-001" }] },
    });
    const link = await authed("post", `/parents/${DAVID}/children`).send({
      studentId: newStudent!.id,
      relationshipType: "father",
      feeResponsible: true,
    });
    expect(link.status).toBe(201);
    const parentsAfter = await prisma.profiles.count({
      where: { OR: [{ email: "david.fernandez@family.demo" }, { national_id: "NID-DAVID-001" }] },
    });
    expect(parentsAfter).toBe(parentsBefore); // no new parent created

    const prof = await authed("get", `/parents/${DAVID}`);
    expect(prof.body.children.some((c: any) => c.studentId === newStudent!.id)).toBe(true);

    // cleanup the throwaway student + link
    await prisma.parent_student.deleteMany({ where: { student_id: newStudent!.id } });
    const st = await prisma.students.findUnique({
      where: { id: newStudent!.id },
      select: { profile_id: true },
    });
    await prisma.students.delete({ where: { id: newStudent!.id } });
    if (st?.profile_id) {
      await prisma.profiles.delete({ where: { id: st.profile_id } }).catch(() => {});
      await prisma.users.delete({ where: { id: st.profile_id } }).catch(() => {});
    }
  });
});

describe("student detail exposes guardians with flags", () => {
  it("the student dashboard lists guardians with relationship + flags", async () => {
    const res = await authed("get", `/students/${SIB[0]}/dashboard`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.guardians)).toBe(true);
    expect(res.body.guardians.length).toBe(2); // David + Maria
    const father = res.body.guardians.find((g: any) => g.relationshipType === "father");
    expect(father.parentId).toBe(DAVID);
    expect(father.isPrimary).toBe(true);
    expect(father.feeResponsible).toBe(true);
  });
});

describe("roll-number uniqueness within a class", () => {
  it("the DB rejects a duplicate (class_id, roll_no)", async () => {
    const sib = await prisma.students.findUnique({
      where: { id: SIB[0] },
      select: { class_id: true, roll_no: true },
    });
    const attempt = prisma.students.updateMany({
      where: { id: SIB[1] },
      data: { class_id: sib!.class_id, roll_no: sib!.roll_no },
    });
    await expect(attempt).rejects.toThrow();
  });
});

describe("demo chain intact", () => {
  it("teacher/parent/student demo accounts still log in", async () => {
    for (const email of [
      "teacher@greenwood.test",
      "parent@greenwood.test",
      "student@greenwood.test",
    ]) {
      const r = await request(http).post("/api/auth/login").send({ email, password: PASSWORD });
      expect(r.status).toBe(201);
    }
  });
});

// Comprehensive admission edge-case matrix: validation, happy paths, dedup,
// RBAC, fee/opening-balance handling, manual vs auto numbers, and parent search.
// Every created student/parent is cleaned up in afterAll.
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
const authed = (m: "get" | "post", path: string, role: string) =>
  request(http)[m](`/api${path}`).set("Authorization", `Bearer ${tokens[role]}`);

const S = `${process.pid}${(globalThis.performance?.now?.() ?? 0) | 0}`;
let classId = "";
let classId2 = "";
let feeId = "";
let feeAmount = 0;
let categoryId = "";
const students: string[] = [];
const emails: string[] = [];

const admit = (role: string, body: any) => authed("post", "/admissions/admit", role).send(body);

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
  const classes = await prisma.classes.findMany({ take: 2, select: { id: true } });
  classId = classes[0].id;
  classId2 = classes[1]?.id ?? classes[0].id;
  const fee = await prisma.fee_structures.findFirst({ select: { id: true, amount: true } });
  feeId = fee!.id;
  feeAmount = Number(fee!.amount);
  categoryId = (await prisma.student_categories.findFirst({ select: { id: true } }))!.id;
});

afterAll(async () => {
  for (const sid of students) {
    const s = await prisma.students.findUnique({ where: { id: sid }, select: { profile_id: true } });
    await prisma.students.delete({ where: { id: sid } }).catch(() => {});
    if (s?.profile_id) {
      await prisma.user_roles.deleteMany({ where: { user_id: s.profile_id } }).catch(() => {});
      await prisma.profiles.delete({ where: { id: s.profile_id } }).catch(() => {});
    }
  }
  for (const e of emails) {
    const p = await prisma.profiles.findFirst({ where: { email: e }, select: { id: true } });
    if (p) {
      await prisma.parent_student.deleteMany({ where: { parent_id: p.id } }).catch(() => {});
      await prisma.user_roles.deleteMany({ where: { user_id: p.id } }).catch(() => {});
      await prisma.profiles.delete({ where: { id: p.id } }).catch(() => {});
    }
    await prisma.$executeRaw`DELETE FROM auth.users WHERE email = ${e}`.catch(() => {});
  }
  // guardian-only profiles created by mother blocks
  await prisma.$executeRaw`DELETE FROM public.parent_student WHERE parent_id IN (SELECT id FROM public.profiles WHERE full_name LIKE ${"EdgeMom%"})`.catch(() => {});
  await prisma.$executeRaw`DELETE FROM public.profiles WHERE full_name LIKE ${"EdgeMom%"}`.catch(() => {});
  await app?.close();
});

const track = (res: any, email?: string) => {
  if (res.body?.studentId) students.push(res.body.studentId);
  if (email) emails.push(email);
  return res;
};

describe("validation (400)", () => {
  it("rejects missing class", async () => {
    const r = await admit("admin", { firstName: "X", parentMode: "new", parentLoginEmail: `a${S}@p.test`, father: { name: "F" } });
    expect(r.status).toBe(400);
  });
  it("rejects missing first name", async () => {
    const r = await admit("admin", { classId, parentMode: "new", parentLoginEmail: `b${S}@p.test`, father: { name: "F" } });
    expect(r.status).toBe(400);
  });
  it("rejects new-parent with no login email", async () => {
    const r = await admit("admin", { classId, firstName: "X", parentMode: "new", father: { name: "F" } });
    expect(r.status).toBe(400);
  });
  it("rejects existing-parent with no parent selected", async () => {
    const r = await admit("admin", { classId, firstName: "X", parentMode: "existing" });
    expect(r.status).toBe(400);
  });
});

describe("RBAC (403)", () => {
  it("teacher cannot admit", async () => {
    const r = await admit("teacher", { classId, firstName: "X", parentMode: "new", parentLoginEmail: `t${S}@p.test`, father: { name: "F" } });
    expect(r.status).toBe(403);
  });
  it("parent cannot admit", async () => {
    const r = await admit("parent", { classId, firstName: "X", parentMode: "new", parentLoginEmail: `p${S}@p.test`, father: { name: "F" } });
    expect(r.status).toBe(403);
  });
  it("teacher cannot reserve numbers", async () => {
    expect((await authed("get", "/admissions/next-numbers", "teacher")).status).toBe(403);
  });
});

describe("happy paths", () => {
  it("minimal new-parent admit succeeds", async () => {
    const email = `min${S}@p.test`;
    const r = track(await admit("admin", { classId, firstName: `Min${S}`, parentMode: "new", primaryGuardian: "father", father: { name: `Dad${S}` }, parentLoginEmail: email }), email);
    expect(r.status).toBe(201);
    expect(r.body.admissionNo).toMatch(/^ADM-/);
  });

  it("zero fee groups + no opening balance → no invoices", async () => {
    const email = `zf${S}@p.test`;
    const r = track(await admit("admin", { classId, firstName: `ZF${S}`, parentMode: "new", father: { name: "F" }, parentLoginEmail: email }), email);
    expect(r.status).toBe(201);
    const fees = await prisma.fee_assignments.count({ where: { student_id: r.body.studentId } });
    expect(fees).toBe(0);
  });

  it("opening balance only → one 'Opening Due Balance' invoice", async () => {
    const email = `ob${S}@p.test`;
    const r = track(await admit("admin", { classId, firstName: `OB${S}`, parentMode: "new", father: { name: "F" }, parentLoginEmail: email, openingDueBalance: 2500 }), email);
    expect(r.status).toBe(201);
    const fees = await prisma.fee_assignments.findMany({ where: { student_id: r.body.studentId } });
    expect(fees.length).toBe(1);
    expect(fees[0].title).toBe("Opening Due Balance");
    expect(Number(fees[0].amount_due)).toBe(2500);
  });

  it("selected fee group → one invoice at the structure amount", async () => {
    const email = `fg${S}@p.test`;
    const r = track(await admit("admin", { classId, firstName: `FG${S}`, parentMode: "new", father: { name: "F" }, parentLoginEmail: email, feeGroupIds: [feeId] }), email);
    expect(r.status).toBe(201);
    const fees = await prisma.fee_assignments.findMany({ where: { student_id: r.body.studentId } });
    expect(fees.length).toBe(1);
    expect(Number(fees[0].amount_due)).toBe(feeAmount);
  });

  it("manual (format-valid) admission + roll are used verbatim", async () => {
    const email = `man${S}@p.test`;
    const manualAdm = `ADM-2099-9${String(S).slice(-4)}`; // conforms to ADM-YYYY-NNNNN
    const r = track(await admit("admin", { classId, firstName: `Man${S}`, admissionNo: manualAdm, rollNo: "777", parentMode: "new", father: { name: "F" }, parentLoginEmail: email }), email);
    expect(r.status).toBe(201);
    expect(r.body.admissionNo).toBe(manualAdm);
    expect(r.body.rollNo).toBe("777");
  });

  it("a badly-formatted admission number gives a clear 400 (not a raw DB error)", async () => {
    const r = await admit("admin", { classId, firstName: `Bad${S}`, admissionNo: "ABC-123", parentMode: "new", father: { name: "F" }, parentLoginEmail: `bad${S}@p.test` });
    expect(r.status).toBe(400);
    expect(String(r.body.message)).toMatch(/ADM-2026/);
  });

  it("full record persists details, medical, custom fields and category", async () => {
    const email = `full${S}@p.test`;
    const r = track(await admit("admin", {
      classId, firstName: `Full${S}`, middleName: "M", lastName: "L", gender: "male", dob: "2019-06-01",
      categoryId, religion: "Hindu", caste: "General", nationality: "Indian", bpl: true, rte: true,
      bloodGroup: "AB+", heightCm: 130, weightKg: 28, medicalHistory: "None",
      bankName: "HDFC", bankAccount: "999", bankIfsc: "HDFC0001", currentAddress: "Addr A", permanentAddress: "Addr B",
      parentMode: "new", father: { name: "F" }, parentLoginEmail: email,
      customFields: { note: "vip" },
    }), email);
    expect(r.status).toBe(201);
    const det = await prisma.student_details.findUnique({ where: { student_id: r.body.studentId } });
    expect(det?.religion).toBe("Hindu");
    expect(det?.bpl).toBe(true);
    expect(det?.category_id).toBe(categoryId);
    expect((det?.custom as any)?.note).toBe("vip");
    const med = await prisma.student_medical.findUnique({ where: { student_id: r.body.studentId } });
    expect(Number(med?.height_cm)).toBe(130);
    expect(med?.blood_group).toBe("AB+");
  });

  it("father primary + mother block → two guardians (one login-less)", async () => {
    const email = `two${S}@p.test`;
    const r = track(await admit("admin", { classId, firstName: `Two${S}`, parentMode: "new", primaryGuardian: "father", father: { name: `Dad${S}` }, mother: { name: `EdgeMom ${S}` }, parentLoginEmail: email }), email);
    expect(r.status).toBe(201);
    const guardians = await prisma.parent_student.count({ where: { student_id: r.body.studentId } });
    expect(guardians).toBe(2);
  });

  it("existing-parent link creates no new account", async () => {
    const david = await prisma.profiles.findFirst({ where: { email: "david.fernandez@family.demo" }, select: { id: true } });
    const r = track(await admit("admin", { classId, firstName: `Link${S}`, parentMode: "existing", existingParentId: david!.id }));
    expect(r.status).toBe(201);
    expect(r.body.parentTempPassword).toBeNull();
  });
});

describe("duplicate prevention (409)", () => {
  it("duplicate parent email", async () => {
    const email = `de${S}@p.test`;
    track(await admit("admin", { classId, firstName: `DE1${S}`, parentMode: "new", father: { name: "F" }, parentLoginEmail: email }), email);
    const r = await admit("admin", { classId, firstName: `DE2${S}`, parentMode: "new", father: { name: "F" }, parentLoginEmail: email });
    expect(r.status).toBe(409);
  });
  it("duplicate parent phone (matches David)", async () => {
    const r = await admit("admin", { classId, firstName: `DP${S}`, parentMode: "new", father: { name: "F", phone: "+91 90000 10001" }, parentLoginEmail: `dp${S}@p.test` });
    expect(r.status).toBe(409);
  });
  it("duplicate national ID (matches David)", async () => {
    const r = await admit("admin", { classId, firstName: `DN${S}`, parentMode: "new", father: { name: "F", aadhaar: "NID-DAVID-001" }, parentLoginEmail: `dn${S}@p.test` });
    expect(r.status).toBe(409);
  });
  it("duplicate manual admission number", async () => {
    const existing = (await prisma.students.findFirst({ where: { admission_no: { not: null } }, select: { admission_no: true } }))!.admission_no!;
    const r = await admit("admin", { classId, firstName: `DA${S}`, admissionNo: existing, parentMode: "new", father: { name: "F" }, parentLoginEmail: `da${S}@p.test` });
    expect(r.status).toBe(409);
  });
  it("duplicate roll in the same class", async () => {
    const email1 = `r1${S}@p.test`, email2 = `r2${S}@p.test`;
    track(await admit("admin", { classId: classId2, firstName: `R1${S}`, rollNo: "991", parentMode: "new", father: { name: "F" }, parentLoginEmail: email1 }), email1);
    const r = await admit("admin", { classId: classId2, firstName: `R2${S}`, rollNo: "991", parentMode: "new", father: { name: "F" }, parentLoginEmail: email2 });
    expect(r.status).toBe(409);
  });
});

describe("concurrency", () => {
  it("10 concurrent admits to one class all get unique rolls (retry-safe)", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => {
        const email = `conc${S}_${i}@p.test`;
        emails.push(email);
        return admit("admin", { classId: classId2, firstName: `Conc${S}_${i}`, parentMode: "new", father: { name: "F" }, parentLoginEmail: email });
      }),
    );
    results.forEach((r) => r.body?.studentId && students.push(r.body.studentId));
    const oks = results.filter((r) => r.status === 201);
    expect(oks.length).toBe(10);
    const rolls = oks.map((r) => r.body.rollNo);
    expect(new Set(rolls).size).toBe(10); // every roll distinct — no collisions
  });
});

describe("parent search", () => {
  it("finds by phone", async () => {
    const r = await authed("get", `/parents/search?phone=${encodeURIComponent("+91 90000 10001")}`, "admin");
    expect(r.body.matches.some((m: any) => m.email === "david.fernandez@family.demo")).toBe(true);
  });
  it("finds by parent code", async () => {
    const r = await authed("get", `/parents/search?parentCode=PAR-DAVID001`, "admin");
    expect(r.body.matches.length).toBeGreaterThanOrEqual(1);
  });
  it("empty query returns no matches", async () => {
    const r = await authed("get", `/parents/search`, "admin");
    expect(r.body.matches).toEqual([]);
  });
  it("a teacher cannot search parents (403)", async () => {
    expect((await authed("get", `/parents/search?q=a`, "teacher")).status).toBe(403);
  });
});

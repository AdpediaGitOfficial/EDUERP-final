import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../infra/database/prisma.service";
import { isPromotion, isSameGrade } from "../../common/grades";
import { AuthService } from "../auth/auth.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/** 8-char alphanumeric suffix for a one-time temp password. */
function randomSuffix(): string {
  return randomBytes(6)
    .toString("base64url")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8);
}

/** Letter grade from an overall percentage (standard Indian CBSE-style bands). */
function gradeForPct(pct: number): string {
  if (pct >= 91) return "A1";
  if (pct >= 81) return "A2";
  if (pct >= 71) return "B1";
  if (pct >= 61) return "B2";
  if (pct >= 51) return "C1";
  if (pct >= 41) return "C2";
  if (pct >= 33) return "D";
  return "E";
}

export type AdmitStudentInput = {
  fullName: string;
  email: string;
  classId?: string | null;
  rollNo?: string | null;
  gender?: "male" | "female" | "other" | null;
};

/**
 * RLS translation for students (api/db/rls-policies-extracted.csv):
 *   students_admin_all    -> admin: unrestricted (read + write)
 *   students_teacher_read -> teacher: rows whose class_id ∈ their teacher_classes
 *   students_parent_read  -> parent: rows linked via parent_student
 *   students_self_read    -> student: the row where profile_id = their uid
 * Roles with no policy (hr, accountant, …) saw zero rows under RLS — the scope
 * filter reproduces that (empty result, not an error) to stay behavior-identical.
 */
@Injectable()
export class StudentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  /**
   * Admit a new student (port of `admitStudent`). Admin-only. Generates the
   * standardized admission number via the DB `next_admission_no()` (kept
   * verbatim so the ADM-YYYY-NNNNN format and sequence are unchanged),
   * provisions an email-confirmed account with a random temp password + the
   * student role, then inserts the students row — rolling the account back if
   * that insert fails. Returns the temp password so the admin can hand it over.
   */
  async admit(actor: AuthUser, input: AdmitStudentInput) {
    if (!actor.roles.includes("admin"))
      throw new ForbiddenException("Only administrators can admit students.");

    const rows = await this.prisma.$queryRaw<{ next_admission_no: string }[]>`
      SELECT public.next_admission_no() AS next_admission_no`;
    const admissionNo = rows[0]?.next_admission_no;
    if (!admissionNo) throw new BadRequestException("Failed to generate admission number");

    const tempPassword = `Welcome-${randomSuffix()}!`;
    const { userId } = await this.auth.provisionAccount({
      email: input.email,
      password: tempPassword,
      fullName: input.fullName,
      role: "student",
    });

    // When placed in a class, auto-assign the next per-class sequential roll if
    // one wasn't supplied — the (class_id, roll_no) unique index is the backstop
    // against duplicates.
    let rollNo = input.rollNo?.trim() || null;
    if (input.classId && !rollNo) {
      const r = await this.prisma.$queryRaw<{ next_roll_no: string }[]>`
        SELECT public.next_roll_no(${input.classId}::uuid) AS next_roll_no`;
      rollNo = r[0]?.next_roll_no ?? null;
    }

    try {
      await this.prisma.students.create({
        data: {
          profile_id: userId,
          class_id: input.classId || null,
          admission_no: admissionNo,
          roll_no: rollNo,
          gender: input.gender ?? null,
        },
      });
    } catch (e) {
      await this.auth.deleteAccount(userId);
      throw e;
    }

    return { ok: true, userId, tempPassword, admissionNo, rollNo };
  }

  /**
   * Bulk-promote active students from one class to another (port of the
   * `promote_students` RPC). Admin-only; excludes the given ids; returns the
   * number moved. Reproduces the SQL effect (the DB function itself gates on
   * Supabase's auth.uid() and can't be called from this session).
   */
  async promote(actor: AuthUser, fromClassId: string, toClassId: string, exclude: string[] = []) {
    if (!actor.roles.includes("admin"))
      throw new ForbiddenException("Only admins can promote students.");
    if (fromClassId === toClassId)
      throw new BadRequestException("The destination class must differ from the source.");
    const [fromClass, toClass] = await Promise.all([
      this.prisma.classes.findUnique({ where: { id: fromClassId }, select: { name: true } }),
      this.prisma.classes.findUnique({ where: { id: toClassId }, select: { name: true } }),
    ]);
    if (!fromClass) throw new NotFoundException("Source class not found");
    if (!toClass) throw new NotFoundException("Destination class not found");
    // Promotion may only advance to a strictly higher grade. Same or lower grade
    // (e.g. Grade 10 → Grade 1, or a same-grade section change) is rejected — a
    // same-grade move is a Transfer, not a promotion.
    if (!isPromotion(fromClass.name, toClass.name)) {
      throw new BadRequestException(
        `Promotion must move students to a higher grade. "${toClass.name}" is not above "${fromClass.name}" — use Transfer for a same-grade change.`,
      );
    }
    const res = await this.prisma.students.updateMany({
      where: {
        class_id: fromClassId,
        status: "active",
        ...(exclude.length ? { id: { notIn: exclude } } : {}),
      },
      data: { class_id: toClassId },
    });
    return { moved: res.count };
  }

  /**
   * Move a single student to another class (transfer / individual promotion).
   * Admin or reception. A fresh roll is assigned in the destination class under
   * a per-class advisory lock so it can't collide with a concurrent transfer or
   * admission; an explicit roll is honoured verbatim. Logs the move.
   */
  async transfer(actor: AuthUser, studentId: string, toClassId: string, rollNo?: string) {
    if (!actor.roles.some((r) => r === "admin" || r === "reception"))
      throw new ForbiddenException("Only admins or reception can transfer students.");
    const student = await this.prisma.students.findUnique({
      where: { id: studentId },
      select: { id: true, class_id: true, classes: { select: { name: true } } },
    });
    if (!student) throw new NotFoundException("Student not found");
    const toClass = await this.prisma.classes.findUnique({
      where: { id: toClassId },
      select: { id: true, name: true, section: true },
    });
    if (!toClass) throw new NotFoundException("Destination class not found");
    if (student.class_id === toClassId)
      throw new BadRequestException("Student is already in that class");
    // A transfer stays within the SAME grade (section / stream / batch change
    // only). Moving to a different grade must go through Promotion instead.
    if (!student.class_id || !student.classes) {
      throw new BadRequestException(
        "This student isn't assigned to a class yet — assign one before transferring.",
      );
    }
    if (!isSameGrade(student.classes.name, toClass.name)) {
      throw new BadRequestException(
        `Transfers must stay within the same grade. "${toClass.name}" is a different grade from "${student.classes.name}" — use Promotion to change grade.`,
      );
    }

    const manualRoll = rollNo?.trim() || null;
    const finalRoll = await this.prisma.$transaction(async (tx) => {
      let roll = manualRoll;
      if (!manualRoll) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${toClassId}))`;
        const r = await tx.$queryRaw<{ n: string }[]>`
          SELECT public.next_roll_no(${toClassId}::uuid) AS n`;
        roll = r[0]?.n ?? null;
      }
      await tx.students.update({
        where: { id: studentId },
        data: { class_id: toClassId, roll_no: roll },
      });
      await tx.student_activity_log.create({
        data: {
          student_id: studentId,
          actor_id: actor.id,
          event_type: "transferred",
          description: `Transferred to ${toClass.name}${toClass.section ? " " + toClass.section : ""} (roll ${roll ?? "—"}).`,
        },
      });
      return roll;
    });
    return { ok: true, classId: toClassId, rollNo: finalRoll };
  }

  /** Bulk-assign a transport route to students (port of `bulkAssignRoute`). */
  async bulkAssignRoute(
    actor: AuthUser,
    routeId: string,
    studentIds: string[],
    stopId?: string | null,
  ) {
    if (!actor.roles.includes("admin"))
      throw new ForbiddenException("Only admins can assign transport routes.");
    await this.prisma.$transaction(
      studentIds.map((sid) =>
        this.prisma.route_students.upsert({
          where: { route_id_student_id: { route_id: routeId, student_id: sid } },
          create: { route_id: routeId, student_id: sid, stop_id: stopId ?? null },
          update: { stop_id: stopId ?? null },
        }),
      ),
    );
    return { assigned: studentIds.length };
  }

  /** Bulk-set student status (port of `bulkSetStudentStatus`). */
  async bulkSetStatus(
    actor: AuthUser,
    studentIds: string[],
    status: "active" | "inactive" | "alumni",
  ) {
    if (!actor.roles.includes("admin"))
      throw new ForbiddenException("Only admins can change student status.");
    const res = await this.prisma.students.updateMany({
      where: { id: { in: studentIds } },
      data: { status },
    });
    return { updated: res.count };
  }

  /**
   * Report-card data for a student (scoped like the dashboard: admin, the
   * teacher of their class, their parent, or the student themselves). Aggregates
   * exam results (optionally filtered by term) into a subject table plus overall
   * percentage/grade, and a term-wide attendance summary.
   */
  async reportCard(actor: AuthUser, studentId: string, term?: string) {
    const scope = this.scopeFilter(actor);
    if (scope === null) throw new ForbiddenException();
    const student = await this.prisma.students.findFirst({
      where: { AND: [{ id: studentId }, scope] },
      include: {
        profiles: { select: { full_name: true } },
        classes: { select: { name: true, section: true, academic_year: true } },
      },
    });
    if (!student) throw new NotFoundException();

    const [results, attnGroups] = await Promise.all([
      this.prisma.exam_results.findMany({
        where: { student_id: studentId, ...(term ? { exams: { term } } : {}) },
        include: {
          exams: {
            select: {
              name: true,
              term: true,
              exam_date: true,
              max_marks: true,
              subjects: { select: { name: true } },
            },
          },
        },
        orderBy: { exams: { exam_date: "asc" } },
      }),
      this.prisma.attendance.groupBy({
        by: ["status"],
        where: { student_id: studentId },
        _count: { _all: true },
      }),
    ]);

    const subjects = results.map((r) => ({
      subject: r.exams?.subjects?.name ?? "—",
      exam: r.exams?.name ?? "—",
      term: r.exams?.term ?? null,
      marks: Number(r.marks_obtained),
      max: Number(r.exams?.max_marks ?? 100),
      grade: r.grade ?? null,
    }));
    const totalMarks = subjects.reduce((s, x) => s + x.marks, 0);
    const totalMax = subjects.reduce((s, x) => s + x.max, 0);
    const percentage = totalMax ? (totalMarks / totalMax) * 100 : 0;

    let present = 0;
    let total = 0;
    for (const g of attnGroups) {
      total += g._count._all;
      if (g.status === "present" || g.status === "late") present += g._count._all;
    }

    return {
      studentName: student.profiles?.full_name ?? null,
      admissionNo: student.admission_no,
      className: student.classes
        ? `${student.classes.name}${student.classes.section ? " · " + student.classes.section : ""}`
        : null,
      academicYear: student.classes?.academic_year ?? null,
      term: term ?? null,
      subjects,
      totalMarks,
      totalMax,
      percentage,
      overallGrade: gradeForPct(percentage),
      attendancePresent: present,
      attendanceTotal: total,
      attendancePct: total ? (present / total) * 100 : 0,
    };
  }

  private scopeFilter(actor: AuthUser): Prisma.studentsWhereInput | null {
    if (actor.roles.includes("admin")) return {};
    if (actor.roles.includes("teacher")) {
      return { classes: { teacher_classes: { some: { teacher_id: actor.id } } } };
    }
    if (actor.roles.includes("parent")) {
      return { parent_student: { some: { parent_id: actor.id } } };
    }
    if (actor.roles.includes("student")) {
      return { profile_id: actor.id };
    }
    return null; // no RLS policy applied to this role -> zero rows
  }

  /**
   * Port of the `search_students` DB function (extracted in Phase 1): rich
   * filter/sort/paginate returning the page rows + total_count. Wrapped in the
   * role scope filter so it is safe for any caller (admin sees all, teacher sees
   * their classes, etc. — same as the RLS the RPC ran under).
   */
  async search(
    actor: AuthUser,
    p: {
      q?: string;
      classId?: string;
      gradeName?: string;
      section?: string;
      gender?: string;
      status?: string;
      fromDate?: string;
      toDate?: string;
      sort?: "name" | "admission_no" | "class" | "admission_date";
      dir?: "asc" | "desc";
      limit?: number;
      offset?: number;
    },
  ) {
    const scope = this.scopeFilter(actor);
    if (scope === null) return { total: 0, rows: [] };

    const and: Prisma.studentsWhereInput[] = [scope];
    if (p.q) {
      and.push({
        OR: [
          { profiles: { full_name: { contains: p.q, mode: "insensitive" } } },
          { admission_no: { contains: p.q, mode: "insensitive" } },
          { classes: { name: { contains: p.q, mode: "insensitive" } } },
        ],
      });
    }
    if (p.classId) and.push({ class_id: p.classId });
    if (p.gradeName) and.push({ classes: { name: p.gradeName } });
    if (p.section) and.push({ classes: { section: p.section } });
    if (p.gender) and.push({ gender: p.gender });
    if (p.status) and.push({ status: p.status as never });
    if (p.fromDate) and.push({ admission_date: { gte: new Date(p.fromDate) } });
    if (p.toDate) and.push({ admission_date: { lte: new Date(p.toDate) } });
    const where: Prisma.studentsWhereInput = { AND: and };

    const dir = p.dir === "asc" ? "asc" : "desc";
    // Match the RPC's sort keys; secondary key created_at desc (as in the function).
    const orderBy: Prisma.studentsOrderByWithRelationInput[] =
      p.sort === "name"
        ? [{ profiles: { full_name: dir } }, { created_at: "desc" }]
        : p.sort === "admission_no"
          ? [{ admission_no: dir }, { created_at: "desc" }]
          : p.sort === "class"
            ? [{ classes: { name: dir } }, { created_at: "desc" }]
            : [{ admission_date: dir }, { created_at: "desc" }];

    const take = Math.min(Math.max(p.limit ?? 50, 1), 200);
    const skip = Math.max(p.offset ?? 0, 0);
    const [total, rows] = await Promise.all([
      this.prisma.students.count({ where }),
      this.prisma.students.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          profiles: { select: { full_name: true, email: true } },
          classes: { select: { name: true, section: true } },
        },
      }),
    ]);
    return {
      total,
      rows: rows.map((s) => ({
        id: s.id,
        admission_no: s.admission_no,
        roll_no: s.roll_no,
        admission_date: s.admission_date,
        gender: s.gender,
        status: s.status,
        profile_id: s.profile_id,
        full_name: s.profiles?.full_name ?? null,
        email: s.profiles?.email ?? null,
        class_id: s.class_id,
        class_name: s.classes?.name ?? null,
        class_section: s.classes?.section ?? null,
      })),
    };
  }

  /**
   * Per-page enrichment for the students table: 30-day attendance ratio and the
   * "worst" fee status per student, scoped to rows the caller can see. Mirrors
   * the client-side aggregation the page did against Supabase.
   */
  async rowExtras(actor: AuthUser, ids: string[]) {
    const scope = this.scopeFilter(actor);
    if (scope === null || ids.length === 0) return { attendance: {}, fees: {} };
    // Constrain to visible ids only (defense-in-depth beyond the page's own list).
    const visible = await this.prisma.students.findMany({
      where: { AND: [scope, { id: { in: ids } }] },
      select: { id: true },
    });
    const visibleIds = visible.map((v) => v.id);
    if (visibleIds.length === 0) return { attendance: {}, fees: {} };

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [att, fees, results, guardians] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ["student_id", "status"],
        where: { student_id: { in: visibleIds }, date: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.fee_assignments.findMany({
        where: { student_id: { in: visibleIds } },
        select: { student_id: true, status: true },
      }),
      // Performance = sum(marks_obtained) / sum(exam.max_marks) per student.
      this.prisma.exam_results.findMany({
        where: { student_id: { in: visibleIds } },
        select: { student_id: true, marks_obtained: true, exams: { select: { max_marks: true } } },
      }),
      this.prisma.parent_student.findMany({
        where: { student_id: { in: visibleIds } },
        select: {
          student_id: true,
          relationship: true,
          profiles: { select: { full_name: true, phone: true, email: true } },
        },
      }),
    ]);
    const attendance: Record<string, { total: number; present: number }> = {};
    for (const r of att) {
      const key = r.student_id as string;
      const m = (attendance[key] ||= { total: 0, present: 0 });
      m.total += r._count._all;
      if (r.status === "present" || r.status === "late") m.present += r._count._all;
    }
    // Keep the highest-ranked status seen (paid > partial > pending), matching
    // the page's original upgrade-only aggregation.
    const rank: Record<string, number> = { pending: 0, partial: 1, paid: 2 };
    const feeStatus: Record<string, string> = {};
    for (const r of fees) {
      const cur = feeStatus[r.student_id];
      const st = r.status as string;
      if (!cur || (rank[st] ?? 0) > (rank[cur] ?? 0)) feeStatus[r.student_id] = st;
    }
    const performance: Record<string, { got: number; max: number }> = {};
    for (const r of results) {
      const m = (performance[r.student_id] ||= { got: 0, max: 0 });
      m.got += Number(r.marks_obtained) || 0;
      m.max += Number(r.exams?.max_marks) || 0;
    }
    const parent: Record<
      string,
      { name: string; phone: string | null; email: string | null; rel: string }
    > = {};
    for (const g of guardians) {
      // First guardian per student wins (matches the page's last-write map,
      // which in practice has one guardian per student in the seed).
      if (!parent[g.student_id]) {
        parent[g.student_id] = {
          name: g.profiles?.full_name ?? "—",
          phone: g.profiles?.phone ?? null,
          email: g.profiles?.email ?? null,
          rel: g.relationship ?? "guardian",
        };
      }
    }
    return { attendance, fees: feeStatus, performance, parent };
  }

  async list(actor: AuthUser, page = 1, pageSize = 50, q?: string, classId?: string) {
    const scope = this.scopeFilter(actor);
    if (scope === null) return { total: 0, page, pageSize, rows: [] };

    const where: Prisma.studentsWhereInput = {
      AND: [
        scope,
        classId ? { class_id: classId } : {},
        q
          ? {
              OR: [
                { admission_no: { contains: q, mode: "insensitive" } },
                { profiles: { full_name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {},
      ],
    };

    const [total, rows] = await Promise.all([
      this.prisma.students.count({ where }),
      this.prisma.students.findMany({
        where,
        orderBy: { admission_date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          profiles: { select: { full_name: true, email: true } },
          classes: { select: { id: true, name: true, section: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      rows: rows.map((s) => ({
        id: s.id,
        admissionNo: s.admission_no,
        rollNo: s.roll_no,
        gender: s.gender,
        status: s.status,
        admissionDate: s.admission_date,
        fullName: s.profiles?.full_name ?? null,
        email: s.profiles?.email ?? null,
        class: s.classes
          ? { id: s.classes.id, name: s.classes.name, section: s.classes.section }
          : null,
      })),
    };
  }

  async get(actor: AuthUser, id: string) {
    const scope = this.scopeFilter(actor);
    if (scope === null) throw new ForbiddenException();
    const student = await this.prisma.students.findFirst({
      where: { AND: [{ id }, scope] },
      include: {
        profiles: { select: { full_name: true, email: true, phone: true } },
        classes: { select: { id: true, name: true, section: true } },
        parent_student: {
          include: {
            profiles: { select: { id: true, full_name: true, email: true, phone: true } },
          },
        },
      },
    });
    // RLS semantics: out-of-scope rows are invisible, indistinguishable from absent.
    if (!student) throw new NotFoundException();
    return {
      id: student.id,
      admissionNo: student.admission_no,
      rollNo: student.roll_no,
      gender: student.gender,
      status: student.status,
      admissionDate: student.admission_date,
      fullName: student.profiles?.full_name ?? null,
      email: student.profiles?.email ?? null,
      phone: student.profiles?.phone ?? null,
      class: student.classes
        ? { id: student.classes.id, name: student.classes.name, section: student.classes.section }
        : null,
      guardians: student.parent_student.map((ps) => ({
        id: ps.profiles?.id,
        fullName: ps.profiles?.full_name,
        email: ps.profiles?.email,
        phone: ps.profiles?.phone,
        relationship: ps.relationship,
      })),
    };
  }

  /**
   * Comprehensive per-child dashboard for the parent child-detail + report
   * pages. Authorized through the student scope (parent/self/teacher/admin);
   * returns supabase-shaped nested rows so the two big pages consume it with
   * minimal change: student, attendance, exam results (+ class-wide results
   * for ranking), fees, homework (+ submissions).
   */
  async dashboard(actor: AuthUser, studentId: string) {
    const scope = this.scopeFilter(actor);
    if (scope === null) throw new ForbiddenException();
    const student = await this.prisma.students.findFirst({
      where: { AND: [{ id: studentId }, scope] },
      include: {
        profiles: { select: { full_name: true, email: true, phone: true } },
        classes: {
          select: {
            id: true,
            name: true,
            section: true,
            academic_year: true,
            class_teacher_id: true,
          },
        },
      },
    });
    if (!student) throw new NotFoundException();
    const classId = student.class_id;

    const [attendance, results, fees, homework, submissions, classResults] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { student_id: studentId },
        orderBy: { date: "asc" },
        select: { date: true, status: true, note: true },
      }),
      this.prisma.exam_results.findMany({
        where: { student_id: studentId },
        select: {
          marks_obtained: true,
          grade: true,
          remarks: true,
          exams: {
            select: {
              id: true,
              name: true,
              term: true,
              exam_date: true,
              max_marks: true,
              subjects: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.fee_assignments.findMany({
        // Demand date gating: staff see everything, but parents/students only
        // see a fee once its "show to parents on" date has arrived.
        where: {
          student_id: studentId,
          ...(actor.roles.some((r) => r === "admin" || r === "accountant" || r === "reception")
            ? {}
            : {
                OR: [
                  { demand_date: null },
                  { demand_date: { lte: new Date(new Date().toISOString().slice(0, 10)) } },
                ],
              }),
        },
        orderBy: { due_date: "asc" },
        select: {
          amount_due: true,
          amount_paid: true,
          status: true,
          due_date: true,
          demand_date: true,
          fee_structures: { select: { name: true, term: true } },
        },
      }),
      classId
        ? this.prisma.homework.findMany({
            where: { class_id: classId },
            orderBy: { assigned_date: "desc" },
            take: 200,
            select: {
              id: true,
              title: true,
              assigned_date: true,
              due_date: true,
              max_marks: true,
              teacher_id: true,
              subjects: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      this.prisma.homework_submissions.findMany({
        where: { student_id: studentId },
        select: {
          homework_id: true,
          submitted_at: true,
          marks: true,
          remarks: true,
          status: true,
        },
      }),
      classId
        ? this.prisma.exam_results.findMany({
            where: { exams: { class_id: classId } },
            select: {
              marks_obtained: true,
              exams: {
                select: {
                  id: true,
                  term: true,
                  max_marks: true,
                  class_id: true,
                  subject_id: true,
                  subjects: { select: { name: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    // Resolve homework teacher names (homework.teacher_id -> profiles).
    const teacherIds = Array.from(
      new Set((homework as any[]).map((h) => h.teacher_id).filter(Boolean)),
    ) as string[];
    const teacherNames = teacherIds.length
      ? new Map(
          (
            await this.prisma.profiles.findMany({
              where: { id: { in: teacherIds } },
              select: { id: true, full_name: true },
            })
          ).map((p) => [p.id, p.full_name]),
        )
      : new Map<string, string>();

    // Class teacher + the class's subject list (for the profile "Academic" card).
    const classTeacherId = student.classes?.class_teacher_id ?? null;
    const [classTeacherProfile, classSubjects] = await Promise.all([
      classTeacherId
        ? this.prisma.profiles.findUnique({
            where: { id: classTeacherId },
            select: { id: true, full_name: true, email: true, phone: true },
          })
        : Promise.resolve(null),
      classId
        ? this.prisma.subjects.findMany({
            where: { class_id: classId },
            orderBy: { name: "asc" },
            select: { id: true, name: true, code: true },
          })
        : Promise.resolve([]),
    ]);
    const classTeacher = classTeacherProfile
      ? {
          id: classTeacherProfile.id,
          name: classTeacherProfile.full_name,
          email: classTeacherProfile.email,
          phone: classTeacherProfile.phone,
        }
      : null;

    // Guardians (with relationship flags) for the student's Parents tab.
    const guardianRows = await this.prisma.parent_student.findMany({
      where: { student_id: studentId },
      include: { profiles: { select: { id: true, full_name: true, email: true, phone: true } } },
      orderBy: [{ is_primary: "desc" }],
    });
    const guardians = guardianRows.map((g) => ({
      parentId: g.parent_id,
      fullName: g.profiles?.full_name ?? null,
      email: g.profiles?.email ?? null,
      phone: g.profiles?.phone ?? null,
      relationshipType: g.relationship_type,
      isPrimary: g.is_primary,
      pickupPermission: g.pickup_permission,
      feeResponsible: g.fee_responsible,
      emergencyContact: g.emergency_contact,
      livesWith: g.lives_with,
    }));

    const dstr = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
    const num = (v: unknown) => (v == null ? null : Number(v));

    return {
      student: {
        id: student.id,
        admission_no: student.admission_no,
        roll_no: student.roll_no,
        admission_date: dstr(student.admission_date),
        gender: student.gender,
        profiles: student.profiles
          ? {
              full_name: student.profiles.full_name,
              email: student.profiles.email,
              phone: student.profiles.phone,
            }
          : null,
        classes: student.classes
          ? {
              id: student.classes.id,
              name: student.classes.name,
              section: student.classes.section,
              academic_year: student.classes.academic_year,
            }
          : null,
      },
      guardians,
      classTeacher,
      subjects: (classSubjects as any[]).map((s) => ({ id: s.id, name: s.name, code: s.code })),
      attendance: attendance.map((a) => ({
        date: dstr(a.date),
        status: a.status,
        note: a.note,
      })),
      results: results.map((r) => ({
        marks_obtained: num(r.marks_obtained),
        grade: r.grade,
        remarks: r.remarks,
        exams: r.exams
          ? {
              id: r.exams.id,
              name: r.exams.name,
              term: r.exams.term,
              exam_date: dstr(r.exams.exam_date),
              max_marks: r.exams.max_marks,
              subjects: r.exams.subjects
                ? { id: r.exams.subjects.id, name: r.exams.subjects.name }
                : null,
            }
          : null,
      })),
      fees: fees.map((f) => ({
        amount_due: num(f.amount_due),
        amount_paid: num(f.amount_paid),
        status: f.status,
        due_date: dstr(f.due_date),
        fee_structures: f.fee_structures
          ? { name: f.fee_structures.name, term: f.fee_structures.term }
          : null,
      })),
      homework: (homework as any[]).map((h) => ({
        id: h.id,
        title: h.title,
        assigned_date: dstr(h.assigned_date),
        due_date: dstr(h.due_date),
        max_marks: h.max_marks,
        subjects: h.subjects ? { name: h.subjects.name } : null,
        teachers: h.teacher_id ? { full_name: teacherNames.get(h.teacher_id) ?? null } : null,
      })),
      submissions: submissions.map((s) => ({
        homework_id: s.homework_id,
        submitted_at: s.submitted_at ? s.submitted_at.toISOString() : null,
        marks: num(s.marks),
        remarks: s.remarks,
        status: s.status,
      })),
      classResults: (classResults as any[]).map((r) => ({
        marks_obtained: num(r.marks_obtained),
        exams: r.exams
          ? {
              id: r.exams.id,
              term: r.exams.term,
              max_marks: r.exams.max_marks,
              class_id: r.exams.class_id,
              subject_id: r.exams.subject_id,
              subjects: r.exams.subjects ? { name: r.exams.subjects.name } : null,
            }
          : null,
      })),
    };
  }

  /**
   * A child's transport assignment (route + bus + driver + stops), for the
   * parent tracking page. Authorized through the same student scope
   * (students_parent_read etc.) — route_students itself has no parent RLS
   * policy, so the old client's direct query returned nothing for a parent;
   * gating on child-visibility here makes the feature work as intended.
   */
  async transport(actor: AuthUser, studentId: string) {
    const scope = this.scopeFilter(actor);
    if (scope === null) throw new ForbiddenException();
    const student = await this.prisma.students.findFirst({
      where: { AND: [{ id: studentId }, scope] },
      select: { id: true },
    });
    if (!student) throw new NotFoundException();

    const a = await this.prisma.route_students.findFirst({
      where: { student_id: studentId },
      include: {
        route_stops: { select: { id: true, name: true } },
        transport_routes: {
          include: {
            fleet_vehicles: { select: { registration_no: true, model: true } },
            drivers: { select: { full_name: true, phone: true } },
            route_stops: {
              select: { id: true, name: true, sequence: true, estimated_minutes: true },
              orderBy: { sequence: "asc" },
            },
          },
        },
      },
    });
    if (!a) return null;
    const r = a.transport_routes;
    return {
      stop_id: a.stop_id,
      pickup_time: a.pickup_time,
      drop_time: a.drop_time,
      stop: a.route_stops ? { id: a.route_stops.id, name: a.route_stops.name } : null,
      route: r
        ? {
            id: r.id,
            name: r.name,
            vehicle_id: r.vehicle_id,
            driver_id: r.driver_id,
            vehicle: r.fleet_vehicles
              ? { registration_no: r.fleet_vehicles.registration_no, model: r.fleet_vehicles.model }
              : null,
            driver: r.drivers ? { full_name: r.drivers.full_name, phone: r.drivers.phone } : null,
            route_stops: r.route_stops.map((s) => ({
              id: s.id,
              name: s.name,
              sequence: s.sequence,
              estimated_minutes: s.estimated_minutes,
            })),
          }
        : null,
    };
  }

  /**
   * Port of find_duplicate_students: students sharing a (case-insensitive) name.
   * Admin-only (the page gates it to admins; it scans the whole student body).
   */
  async duplicates(actor: AuthUser) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const rows = await this.prisma.students.findMany({
      select: { id: true, profiles: { select: { full_name: true } } },
    });
    const byName = new Map<string, { full_name: string; ids: string[] }>();
    for (const r of rows) {
      const name = r.profiles?.full_name ?? "";
      const key = name.toLowerCase();
      const entry = byName.get(key) ?? { full_name: name, ids: [] };
      entry.ids.push(r.id);
      byName.set(key, entry);
    }
    return [...byName.values()]
      .filter((e) => e.ids.length > 1)
      .map((e) => ({ full_name: e.full_name, count: e.ids.length, student_ids: e.ids }))
      .sort((a, b) => b.count - a.count || a.full_name.localeCompare(b.full_name));
  }

  /**
   * Link a parent profile to a student by admission number.
   * ps_admin_all is the ONLY write policy on parent_student — under RLS a
   * parent's own insert silently failed, so this stays admin-only (parents
   * receive the same rejection the RLS gave them).
   */
  async linkParent(actor: AuthUser, admissionNo: string, parentId: string) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const student = await this.prisma.students.findUnique({
      where: { admission_no: admissionNo },
      select: { id: true },
    });
    if (!student) throw new BadRequestException("No student found with that admission number");
    await this.prisma.parent_student.upsert({
      where: { parent_id_student_id: { parent_id: parentId, student_id: student.id } },
      create: { parent_id: parentId, student_id: student.id },
      update: {},
    });
    return { ok: true, studentId: student.id };
  }

  /**
   * A child's weekly class timetable, authorized through the student scope so a
   * parent (or the student, or a class teacher, or admin) can view it. The
   * global /timetable route is teacher/student-only; this surfaces the same data
   * per-child on the parent portal without widening that route's audience.
   */
  async classTimetable(actor: AuthUser, studentId: string) {
    const scope = this.scopeFilter(actor);
    if (scope === null) throw new ForbiddenException();
    const student = await this.prisma.students.findFirst({
      where: { AND: [{ id: studentId }, scope] },
      select: { class_id: true },
    });
    if (!student) throw new NotFoundException();
    if (!student.class_id) return [];

    const rows = await this.prisma.timetable.findMany({
      where: { class_id: student.class_id },
      orderBy: [{ day_of_week: "asc" }, { start_time: "asc" }],
      include: { subjects: { select: { name: true } } },
    });
    // teacher_id -> profiles (users has no direct profiles relation).
    const teacherIds = Array.from(
      new Set(rows.map((t) => t.teacher_id).filter(Boolean)),
    ) as string[];
    const names = teacherIds.length
      ? new Map(
          (
            await this.prisma.profiles.findMany({
              where: { id: { in: teacherIds } },
              select: { id: true, full_name: true },
            })
          ).map((p) => [p.id, p.full_name]),
        )
      : new Map<string, string>();
    const hhmm = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
    return rows.map((t) => ({
      id: t.id,
      dayOfWeek: t.day_of_week,
      startTime: hhmm(t.start_time),
      endTime: hhmm(t.end_time),
      room: t.room,
      subjectName: t.subjects?.name ?? null,
      teacherName: t.teacher_id ? (names.get(t.teacher_id) ?? null) : null,
    }));
  }

  /**
   * Per-child notices feed: school-wide announcements, parent-audience notices,
   * and class notices for the child's class. Same student scope as the rest of
   * the child views, so a parent sees exactly the notices relevant to that child.
   */
  async notices(actor: AuthUser, studentId: string) {
    const scope = this.scopeFilter(actor);
    if (scope === null) throw new ForbiddenException();
    const student = await this.prisma.students.findFirst({
      where: { AND: [{ id: studentId }, scope] },
      select: { class_id: true },
    });
    if (!student) throw new NotFoundException();

    const or: Prisma.announcementsWhereInput[] = [{ audience: "all" }, { audience: "parents" }];
    if (student.class_id) or.push({ audience: "class", class_id: student.class_id });

    const rows = await this.prisma.announcements.findMany({
      where: { OR: or },
      orderBy: { created_at: "desc" },
      take: 30,
      include: { classes: { select: { name: true, section: true } } },
    });
    const authorIds = Array.from(new Set(rows.map((a) => a.author_id).filter(Boolean)));
    const authors = authorIds.length
      ? new Map(
          (
            await this.prisma.profiles.findMany({
              where: { id: { in: authorIds } },
              select: { id: true, full_name: true },
            })
          ).map((p) => [p.id, p.full_name]),
        )
      : new Map<string, string>();
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      audience: a.audience,
      className: a.classes ? `${a.classes.name} ${a.classes.section ?? ""}`.trim() : null,
      author: authors.get(a.author_id) ?? null,
      createdAt: a.created_at.toISOString(),
    }));
  }
}

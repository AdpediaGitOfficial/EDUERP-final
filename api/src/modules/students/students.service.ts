import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
        classes: { select: { id: true, name: true, section: true, academic_year: true } },
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
        where: { student_id: studentId },
        orderBy: { due_date: "asc" },
        select: {
          amount_due: true,
          amount_paid: true,
          status: true,
          due_date: true,
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
}

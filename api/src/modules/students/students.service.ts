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

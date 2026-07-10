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

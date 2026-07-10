import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   homework:  homework_read_auth -> any authenticated read; homework_teacher_admin_write
 *              -> teacher|admin create/update/delete
 *   homework_submissions:
 *     "students read own submissions"   -> student: own rows (admin too)
 *     "students insert/update own"      -> student: write own rows
 *     "teachers grade submissions"      -> teacher|admin: update (grading)
 *   exams:        exams_admin_all; exams_read_staff -> admin|teacher read
 *   exam_results: results_admin_all; results_teacher_read (their classes' exams);
 *                 results_parent_read (children); results_self_read (own)
 */
@Injectable()
export class HomeworkService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listHomework(actor: AuthUser, classId?: string, page = 1, pageSize = 50) {
    // homework_read_auth: qual true — every authenticated role reads.
    const where: Prisma.homeworkWhereInput = classId ? { class_id: classId } : {};
    const [total, rows] = await Promise.all([
      this.prisma.homework.count({ where }),
      this.prisma.homework.findMany({
        where,
        orderBy: { due_date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          subjects: { select: { name: true } },
          classes: { select: { name: true, section: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((h) => ({
        id: h.id,
        title: h.title,
        description: h.description,
        classId: h.class_id,
        className: h.classes ? `${h.classes.name} ${h.classes.section ?? ""}`.trim() : null,
        subjectName: h.subjects?.name ?? null,
        teacherId: h.teacher_id,
        assignedDate: h.assigned_date,
        dueDate: h.due_date,
        status: h.status,
        maxMarks: h.max_marks,
      })),
    };
  }

  async createHomework(
    actor: AuthUser,
    data: {
      classId: string;
      subjectId?: string;
      title: string;
      description?: string;
      dueDate: string;
      maxMarks?: number;
    },
  ) {
    // homework_teacher_admin_write
    if (!actor.roles.some((r) => r === "admin" || r === "teacher")) throw new ForbiddenException();
    const row = await this.prisma.homework.create({
      data: {
        class_id: data.classId,
        subject_id: data.subjectId ?? null,
        teacher_id: actor.id,
        title: data.title,
        description: data.description ?? null,
        due_date: new Date(data.dueDate),
        status: "active",
        max_marks: data.maxMarks ?? null,
      },
    });
    return { id: row.id };
  }

  async listSubmissions(actor: AuthUser, homeworkId: string) {
    if (actor.roles.some((r) => r === "admin" || r === "teacher")) {
      const rows = await this.prisma.homework_submissions.findMany({
        where: { homework_id: homeworkId },
        include: {
          students: { select: { roll_no: true, profiles: { select: { full_name: true } } } },
        },
      });
      return rows.map((s) => this.submissionRow(s));
    }
    if (actor.roles.includes("student")) {
      // "students read own submissions"
      const rows = await this.prisma.homework_submissions.findMany({
        where: { homework_id: homeworkId, students: { profile_id: actor.id } },
        include: {
          students: { select: { roll_no: true, profiles: { select: { full_name: true } } } },
        },
      });
      return rows.map((s) => this.submissionRow(s));
    }
    return [];
  }

  async grade(actor: AuthUser, submissionId: string, marks: number, remarks?: string) {
    // "teachers grade submissions": teacher|admin update
    if (!actor.roles.some((r) => r === "admin" || r === "teacher")) throw new ForbiddenException();
    await this.prisma.homework_submissions.update({
      where: { id: submissionId },
      data: { marks, remarks: remarks ?? null, status: "reviewed", reviewed_at: new Date() },
    });
    return { ok: true };
  }

  async listExamResults(
    actor: AuthUser,
    opts: { studentId?: string; examId?: string; page?: number; pageSize?: number },
  ) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 100, 500);
    let scope: Prisma.exam_resultsWhereInput | null = null;
    if (actor.roles.includes("admin")) scope = {};
    else if (actor.roles.includes("teacher")) {
      // results_teacher_read: results of exams in the teacher's classes
      scope = { exams: { classes: { teacher_classes: { some: { teacher_id: actor.id } } } } };
    } else if (actor.roles.includes("parent")) {
      scope = { students: { parent_student: { some: { parent_id: actor.id } } } };
    } else if (actor.roles.includes("student")) {
      scope = { students: { profile_id: actor.id } };
    }
    if (scope === null) return { total: 0, page, pageSize, rows: [] };

    const where: Prisma.exam_resultsWhereInput = {
      AND: [
        scope,
        opts.studentId ? { student_id: opts.studentId } : {},
        opts.examId ? { exam_id: opts.examId } : {},
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.exam_results.count({ where }),
      this.prisma.exam_results.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          exams: { select: { name: true, max_marks: true, exam_date: true } },
          students: { select: { roll_no: true, profiles: { select: { full_name: true } } } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((r) => ({
        id: r.id,
        examId: r.exam_id,
        examName: r.exams?.name ?? null,
        examDate: r.exams?.exam_date ?? null,
        maxMarks: r.exams?.max_marks ?? null,
        studentId: r.student_id,
        studentName: r.students?.profiles?.full_name ?? null,
        marksObtained: r.marks_obtained,
        grade: r.grade,
      })),
    };
  }

  private submissionRow(s: any) {
    return {
      id: s.id,
      homeworkId: s.homework_id,
      studentId: s.student_id,
      studentName: s.students?.profiles?.full_name ?? null,
      rollNo: s.students?.roll_no ?? null,
      status: s.status,
      submittedAt: s.submitted_at,
      marks: s.marks,
      remarks: s.remarks,
      reviewedAt: s.reviewed_at,
    };
  }
}

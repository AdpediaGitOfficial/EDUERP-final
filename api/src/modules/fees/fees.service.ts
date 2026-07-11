import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   fee_assignments: fa_admin_all; fa_teacher_read (their classes' students);
 *                    fa_parent_read (children); fa_student_read (own)
 *   payments:        pay_admin_all; pay_parent_read; pay_student_read
 *
 * The `update_fee_on_payment` DB trigger recomputes fee_assignments.status/
 * amount_paid on payment insert. It remains active in the database, so recording
 * a payment through this API keeps fee statuses correct for BOTH stacks during
 * coexistence; it gets ported to service logic when the trigger is retired.
 */
@Injectable()
export class FeesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** fee_structures are admin-managed (fs_admin_write); linked-user read (fs_linked_read). */
  async listStructures(actor: AuthUser) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const rows = await this.prisma.fee_structures.findMany({
      orderBy: { created_at: "desc" },
      include: { classes: { select: { name: true, section: true } } },
    });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      classId: s.class_id,
      className: s.classes ? `${s.classes.name} ${s.classes.section ?? ""}`.trim() : null,
      amount: s.amount,
      term: s.term,
      academicYear: s.academic_year,
      frequency: s.frequency,
    }));
  }

  async createStructure(
    actor: AuthUser,
    data: {
      name: string;
      classId?: string;
      amount: number;
      term?: string;
      academicYear?: string;
      frequency?: string;
    },
  ) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const row = await this.prisma.fee_structures.create({
      data: {
        name: data.name,
        class_id: data.classId || null,
        amount: new Prisma.Decimal(data.amount),
        term: data.term || null,
        academic_year: data.academicYear || "2025-2026",
        frequency: (data.frequency ?? "one_time") as never,
      },
    });
    return { id: row.id };
  }

  /** Bulk-assign a fee structure to a class (or the whole school). Admin only. */
  async assignStructure(actor: AuthUser, structureId: string, dueDate: string, classId?: string) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const structure = await this.prisma.fee_structures.findUnique({ where: { id: structureId } });
    if (!structure) throw new ForbiddenException("Fee structure not found");
    const targets = await this.prisma.students.findMany({
      where: classId ? { class_id: classId } : {},
      select: { id: true },
    });
    if (targets.length === 0) return { assigned: 0 };
    await this.prisma.fee_assignments.createMany({
      data: targets.map((t) => ({
        student_id: t.id,
        structure_id: structure.id,
        title: structure.name,
        amount_due: structure.amount,
        due_date: new Date(dueDate),
      })),
    });
    return { assigned: targets.length };
  }

  private feeScope(actor: AuthUser): Prisma.fee_assignmentsWhereInput | null {
    if (actor.roles.includes("admin")) return {};
    if (actor.roles.includes("teacher")) {
      return { students: { classes: { teacher_classes: { some: { teacher_id: actor.id } } } } };
    }
    if (actor.roles.includes("parent")) {
      return { students: { parent_student: { some: { parent_id: actor.id } } } };
    }
    if (actor.roles.includes("student")) {
      return { students: { profile_id: actor.id } };
    }
    return null;
  }

  async listAssignments(
    actor: AuthUser,
    opts: { studentId?: string; status?: string; page?: number; pageSize?: number },
  ) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 50, 200);
    const scope = this.feeScope(actor);
    if (scope === null) return { total: 0, page, pageSize, rows: [] };

    const where: Prisma.fee_assignmentsWhereInput = {
      AND: [
        scope,
        opts.studentId ? { student_id: opts.studentId } : {},
        opts.status ? { status: opts.status as never } : {},
      ],
    };
    const [total, rows, sums] = await Promise.all([
      this.prisma.fee_assignments.count({ where }),
      this.prisma.fee_assignments.findMany({
        where,
        orderBy: { due_date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          students: { select: { admission_no: true, profiles: { select: { full_name: true } } } },
        },
      }),
      this.prisma.fee_assignments.aggregate({
        where,
        _sum: { amount_due: true, amount_paid: true },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      totals: {
        due: sums._sum.amount_due ?? 0,
        paid: sums._sum.amount_paid ?? 0,
      },
      rows: rows.map((f) => ({
        id: f.id,
        studentId: f.student_id,
        studentName: f.students?.profiles?.full_name ?? null,
        admissionNo: f.students?.admission_no ?? null,
        title: f.title,
        amountDue: f.amount_due,
        amountPaid: f.amount_paid,
        dueDate: f.due_date,
        status: f.status,
      })),
    };
  }

  async listPayments(
    actor: AuthUser,
    opts: { studentId?: string; page?: number; pageSize?: number },
  ) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 50, 200);
    let scope: Prisma.paymentsWhereInput | null = null;
    if (actor.roles.includes("admin")) scope = {};
    else if (actor.roles.includes("parent")) {
      scope = { students: { parent_student: { some: { parent_id: actor.id } } } };
    } else if (actor.roles.includes("student")) {
      scope = { students: { profile_id: actor.id } };
    }
    if (scope === null) return { total: 0, page, pageSize, rows: [] };

    const where: Prisma.paymentsWhereInput = {
      AND: [scope, opts.studentId ? { student_id: opts.studentId } : {}],
    };
    const [total, rows] = await Promise.all([
      this.prisma.payments.count({ where }),
      this.prisma.payments.findMany({
        where,
        orderBy: { paid_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          students: { select: { admission_no: true, profiles: { select: { full_name: true } } } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((p) => ({
        id: p.id,
        studentId: p.student_id,
        studentName: p.students?.profiles?.full_name ?? null,
        admissionNo: p.students?.admission_no ?? null,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        paidAt: p.paid_at,
      })),
    };
  }

  /** pay_admin_all is the only write policy on payments — admin records payments. */
  async recordPayment(
    actor: AuthUser,
    data: {
      studentId: string;
      feeAssignmentId: string;
      amount: number;
      method?: string;
      reference?: string;
    },
  ) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    const row = await this.prisma.payments.create({
      data: {
        student_id: data.studentId,
        fee_assignment_id: data.feeAssignmentId,
        amount: new Prisma.Decimal(data.amount),
        method: data.method ?? "manual",
        reference: data.reference ?? null,
        recorded_by: actor.id,
      },
    });
    // fee_assignments.status/amount_paid recompute happens in the still-active
    // update_fee_on_payment DB trigger (see class doc).
    return { id: row.id, receiptNo: row.receipt_no };
  }
}

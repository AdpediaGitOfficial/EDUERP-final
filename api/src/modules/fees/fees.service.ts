import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";
import { NotificationsService } from "../notifications/notifications.service";
import { PaymentGatewayService } from "./payment-gateway.service";

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
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(PaymentGatewayService) private readonly gateway: PaymentGatewayService,
  ) {}

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
    // Notify the linked parents that a new fee is due (in-app + email).
    const notice = await this.notifications.notifyFeeDue({
      senderId: actor.id,
      studentIds: targets.map((t) => t.id),
      title: structure.name,
      amount: Number(structure.amount),
      dueDate,
    });
    return { assigned: targets.length, notified: notice.recipients };
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
    opts: { studentId?: string; page?: number; pageSize?: number; source?: string },
  ) {
    const page = opts.page ?? 1;
    const pageSize = Math.min(opts.pageSize ?? 50, 200);
    let scope: Prisma.paymentsWhereInput | null = null;
    if (actor.roles.some((r) => r === "admin" || r === "accountant")) scope = {};
    else if (actor.roles.includes("parent")) {
      scope = { students: { parent_student: { some: { parent_id: actor.id } } } };
    } else if (actor.roles.includes("student")) {
      scope = { students: { profile_id: actor.id } };
    }
    if (scope === null) return { total: 0, page, pageSize, rows: [] };

    const where: Prisma.paymentsWhereInput = {
      AND: [
        scope,
        opts.studentId ? { student_id: opts.studentId } : {},
        opts.source ? { payment_source: opts.source } : {},
      ],
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
          fee_assignments: { select: { title: true, status: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((p) => this.paymentRow(p)),
    };
  }

  /**
   * Load a single payment for its receipt, scoped like the list (admin/accountant
   * see all; parent/student see their own; everyone else 404 via invisibility).
   * Includes the class name for the receipt header.
   */
  async getPaymentForReceipt(actor: AuthUser, id: string) {
    let scope: Prisma.paymentsWhereInput | null = null;
    if (actor.roles.some((r) => r === "admin" || r === "accountant")) scope = {};
    else if (actor.roles.includes("parent")) {
      scope = { students: { parent_student: { some: { parent_id: actor.id } } } };
    } else if (actor.roles.includes("student")) {
      scope = { students: { profile_id: actor.id } };
    }
    if (scope === null) throw new NotFoundException();

    const p = await this.prisma.payments.findFirst({
      where: { AND: [{ id }, scope] },
      include: {
        students: {
          select: {
            admission_no: true,
            profiles: { select: { full_name: true } },
            classes: { select: { name: true, section: true } },
          },
        },
        fee_assignments: { select: { title: true } },
      },
    });
    if (!p) throw new NotFoundException();
    const cls = p.students?.classes;
    return {
      receiptNo: p.receipt_no,
      paidAt: p.paid_at,
      studentName: p.students?.profiles?.full_name ?? null,
      admissionNo: p.students?.admission_no ?? null,
      className: cls ? `${cls.name}${cls.section ? " · " + cls.section : ""}` : null,
      feeTitle: p.fee_assignments?.title ?? null,
      amount: Number(p.amount),
      method: p.method,
      reference: p.reference,
      recordedBy: null as string | null,
    };
  }

  /** Shared row/receipt shape so offline and online payments render identically. */
  private paymentRow(p: any) {
    return {
      id: p.id,
      studentId: p.student_id,
      studentName: p.students?.profiles?.full_name ?? null,
      admissionNo: p.students?.admission_no ?? null,
      feeAssignmentId: p.fee_assignment_id,
      feeTitle: p.fee_assignments?.title ?? null,
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      receiptNo: p.receipt_no,
      status: p.status,
      paymentSource: p.payment_source,
      proofUrl: p.proof_url,
      notes: p.notes,
      paidAt: p.paid_at,
    };
  }

  /** Methods that must carry a reference (UPI txn id, cheque no, bank ref, card auth). */
  private static NON_CASH = new Set(["upi", "card", "bank", "cheque", "online", "netbanking"]);

  /**
   * Core payment writer shared by the offline (staff) and online (parent gateway)
   * paths. Enforces the reference-required-for-non-cash rule and the
   * duplicate-payment guard, then returns the full receipt payload so the caller
   * can show a receipt immediately. fee_assignments.amount_paid/status recompute
   * in the still-active update_fee_on_payment trigger — so every path
   * (cash/UPI/card/online) keeps the invoice + dashboards reconciled.
   */
  private async writePayment(data: {
    studentId: string;
    feeAssignmentId: string;
    amount: number;
    method: string;
    reference?: string | null;
    notes?: string | null;
    proofUrl?: string | null;
    paymentSource: "offline" | "online";
    status?: "successful" | "pending" | "failed";
    recordedBy?: string | null;
    force?: boolean;
  }) {
    const method = (data.method || "cash").toLowerCase();
    const reference = data.reference?.trim() || null;
    if (FeesService.NON_CASH.has(method) && !reference) {
      throw new BadRequestException(
        `A reference number is required for ${method} payments (UPI transaction ID, cheque number, or bank reference).`,
      );
    }
    if (data.amount <= 0) throw new BadRequestException("Amount must be greater than zero.");

    // Duplicate-payment guard: an identical (invoice + amount + reference) entry
    // in the last 5 minutes is almost always a double-click or a re-typed UPI id.
    if (!data.force) {
      const dupWindow = new Date(Date.now() - 5 * 60 * 1000);
      const dup = await this.prisma.payments.findFirst({
        where: {
          fee_assignment_id: data.feeAssignmentId,
          amount: new Prisma.Decimal(data.amount),
          reference,
          paid_at: { gte: dupWindow },
        },
      });
      if (dup) {
        throw new ConflictException(
          "A matching payment (same invoice, amount and reference) was recorded moments ago. Re-submit with force=true to record it anyway.",
        );
      }
    }

    const row = await this.prisma.payments.create({
      data: {
        student_id: data.studentId,
        fee_assignment_id: data.feeAssignmentId,
        amount: new Prisma.Decimal(data.amount),
        method,
        reference,
        notes: data.notes?.trim() || null,
        proof_url: data.proofUrl || null,
        payment_source: data.paymentSource,
        status: (data.status ?? "successful") as never,
        recorded_by: data.recordedBy ?? null,
      },
      include: {
        students: { select: { admission_no: true, profiles: { select: { full_name: true } } } },
        fee_assignments: { select: { title: true, status: true } },
      },
    });
    return this.paymentRow(row);
  }

  /**
   * Offline payment recorded by staff (cash / UPI / card / bank transfer / cheque),
   * including the in-person UPI reconciliation flow. Admin or accountant only
   * (pay_admin_all + the accountant finance role).
   */
  async recordPayment(
    actor: AuthUser,
    data: {
      studentId: string;
      feeAssignmentId: string;
      amount: number;
      method?: string;
      reference?: string;
      notes?: string;
      proofUrl?: string;
      force?: boolean;
    },
  ) {
    if (!actor.roles.some((r) => r === "admin" || r === "accountant")) {
      throw new ForbiddenException();
    }
    return this.writePayment({
      studentId: data.studentId,
      feeAssignmentId: data.feeAssignmentId,
      amount: data.amount,
      method: data.method ?? "cash",
      reference: data.reference,
      notes: data.notes,
      proofUrl: data.proofUrl,
      paymentSource: "offline",
      recordedBy: actor.id,
      force: data.force,
    });
  }

  /**
   * Parent-facing online payment. A parent (or student) pays their OWN invoice
   * through the swappable payment gateway; the resulting row lands in the SAME
   * payments table with payment_source='online'. Scope reuses the fee_assignments
   * read policy, so a parent can only pay an invoice belonging to one of their
   * children (fa_parent_read) — anything else 404s (RLS invisibility).
   */
  async payOnline(
    actor: AuthUser,
    data: {
      feeAssignmentId: string;
      method: "upi" | "card" | "netbanking" | "wallet";
      instrument?: string;
      amount?: number;
      simulateOutcome?: "successful" | "pending" | "failed";
    },
  ) {
    const scope = this.feeScope(actor);
    if (scope === null) throw new ForbiddenException();
    const assignment = await this.prisma.fee_assignments.findFirst({
      where: { AND: [scope, { id: data.feeAssignmentId }] },
      include: {
        students: { select: { id: true, profiles: { select: { full_name: true } } } },
      },
    });
    if (!assignment) throw new NotFoundException("Fee not found"); // RLS invisibility

    const balance = Number(assignment.amount_due) - Number(assignment.amount_paid);
    const amount = data.amount && data.amount > 0 ? data.amount : balance;
    if (amount <= 0) throw new BadRequestException("This invoice has no outstanding balance.");

    const orderRef = `GW-${assignment.id.slice(0, 8).toUpperCase()}`;
    const result = await this.gateway.charge({
      amount,
      method: data.method,
      instrument: data.instrument,
      orderRef,
      simulateOutcome: data.simulateOutcome,
    });
    if (result.status === "failed") {
      // No row is written for a failed charge — nothing to reconcile.
      return { status: "failed" as const, gatewayRef: result.gatewayRef };
    }

    const dbMethod = data.method === "netbanking" ? "bank" : data.method;
    const label =
      data.method === "upi"
        ? `UPI ${data.instrument ?? ""}`.trim()
        : data.method === "card"
          ? `Card ${data.instrument ?? ""}`.trim()
          : data.method === "netbanking"
            ? `NetBanking ${data.instrument ?? ""}`.trim()
            : `Wallet ${data.instrument ?? ""}`.trim();

    const receipt = await this.writePayment({
      studentId: assignment.student_id,
      feeAssignmentId: assignment.id,
      amount,
      method: dbMethod,
      reference: `${label} · ${result.gatewayRef}`,
      paymentSource: "online",
      status: result.status,
      recordedBy: actor.id,
    });

    if (result.status === "successful") {
      await this.notifications.notifyPaymentConfirmed({
        senderId: actor.id,
        parentUserId: actor.id,
        amount,
        receiptNo: receipt.receiptNo,
        title: assignment.title,
      });
    }
    // receipt.status already carries the gateway outcome (successful | pending).
    return { ...receipt, gatewayRef: result.gatewayRef };
  }
}

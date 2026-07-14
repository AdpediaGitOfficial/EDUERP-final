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
    // Read-only view for finance staff (admin + accountant). Authoring structures
    // stays admin-only (see createStructure / assignStructure).
    if (!actor.roles.includes("admin") && !actor.roles.includes("accountant"))
      throw new ForbiddenException();
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
      method: "upi" | "card" | "netbanking";
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
          : `NetBanking ${data.instrument ?? ""}`.trim();

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

  // ============================ Fees Collection ============================
  // A dedicated collection workspace for admin/accountant: filter students, drill
  // into their fee heads, collect (with discount/fine), print a receipt, and
  // chase dues with multi-channel reminders. Reuses the same payments table and
  // the update_fee_on_payment reconciliation, so it stays consistent with the
  // existing Fees module and every dashboard.

  private round2(n: number) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private ensureCollector(actor: AuthUser) {
    if (!actor.roles.some((r) => r === "admin" || r === "accountant")) {
      throw new ForbiddenException();
    }
  }

  /** Filter option lists for the Collection screens (dropdown sources). */
  async collectionFilters(actor: AuthUser) {
    this.ensureCollector(actor);
    const [classes, titles] = await Promise.all([
      this.prisma.classes.findMany({
        select: { name: true, section: true, academic_year: true },
        orderBy: [{ academic_year: "desc" }, { name: "asc" }, { section: "asc" }],
      }),
      this.prisma.fee_assignments.findMany({
        distinct: ["title"],
        select: { title: true },
        orderBy: { title: "asc" },
        take: 200,
      }),
    ]);
    const academicYears = Array.from(new Set(classes.map((c) => c.academic_year)))
      .sort()
      .reverse();
    const classNames = Array.from(new Set(classes.map((c) => c.name)));
    const sections = Array.from(
      new Set(classes.map((c) => c.section).filter((s): s is string => !!s)),
    ).sort();
    return {
      academicYears,
      classNames,
      sections,
      categories: titles.map((t) => t.title),
      statuses: ["pending", "partial", "overdue", "paid"],
    };
  }

  private collectionAssignmentWhere(opts: {
    academicYear?: string;
    className?: string;
    section?: string;
    category?: string;
    status?: string;
    dueDate?: string;
    search?: string;
  }): Prisma.fee_assignmentsWhereInput {
    const AND: Prisma.fee_assignmentsWhereInput[] = [];
    const classWhere: Prisma.classesWhereInput = {};
    if (opts.academicYear) classWhere.academic_year = opts.academicYear;
    if (opts.className) classWhere.name = opts.className;
    if (opts.section) classWhere.section = opts.section;
    const studentWhere: Prisma.studentsWhereInput = {};
    if (Object.keys(classWhere).length) studentWhere.classes = classWhere;
    if (opts.search) {
      studentWhere.OR = [
        { admission_no: { contains: opts.search, mode: "insensitive" } },
        { profiles: { full_name: { contains: opts.search, mode: "insensitive" } } },
      ];
    }
    if (Object.keys(studentWhere).length) AND.push({ students: studentWhere });
    if (opts.category) AND.push({ title: opts.category });
    if (opts.status) AND.push({ status: opts.status as never });
    if (opts.dueDate) AND.push({ due_date: { lte: new Date(opts.dueDate) } });
    return AND.length ? { AND } : {};
  }

  /** Filtered student list with per-student due summary (Collect + Due views). */
  async collectionStudents(
    actor: AuthUser,
    opts: {
      academicYear?: string;
      className?: string;
      section?: string;
      category?: string;
      status?: string;
      dueDate?: string;
      search?: string;
      onlyDue?: boolean;
      page?: number;
      pageSize?: number;
    },
  ) {
    this.ensureCollector(actor);
    const where = this.collectionAssignmentWhere(opts);
    const grouped = await this.prisma.fee_assignments.groupBy({
      by: ["student_id"],
      where,
      _sum: { amount_due: true, amount_paid: true },
      _min: { due_date: true },
      _count: { _all: true },
    });
    let rows = grouped.map((g) => {
      const assigned = Number(g._sum.amount_due ?? 0);
      const paid = Number(g._sum.amount_paid ?? 0);
      return {
        studentId: g.student_id,
        assigned: this.round2(assigned),
        paid: this.round2(paid),
        due: this.round2(assigned - paid),
        items: g._count._all,
        oldestDue: g._min.due_date,
      };
    });
    if (opts.onlyDue) rows = rows.filter((r) => r.due > 0.009);
    rows.sort((a, b) => b.due - a.due);

    const total = rows.length;
    const totalsDue = this.round2(rows.reduce((s, r) => s + r.due, 0));
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(opts.pageSize ?? 50, 200);
    const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

    const students = await this.prisma.students.findMany({
      where: { id: { in: pageRows.map((r) => r.studentId) } },
      select: {
        id: true,
        admission_no: true,
        roll_no: true,
        profiles: { select: { full_name: true, phone: true, email: true } },
        classes: { select: { name: true, section: true, academic_year: true } },
        parent_student: {
          select: { profiles: { select: { full_name: true, phone: true, email: true } } },
        },
      },
    });
    const byId = new Map(students.map((s) => [s.id, s]));
    const todayStart = new Date(new Date().toISOString().slice(0, 10));
    return {
      total,
      page,
      pageSize,
      totals: { due: totalsDue, students: total },
      rows: pageRows.map((r) => {
        const s = byId.get(r.studentId);
        const cls = s?.classes;
        const primary = s?.parent_student?.[0]?.profiles;
        const oldest = r.oldestDue ? new Date(r.oldestDue) : null;
        const daysOverdue =
          oldest && oldest < todayStart
            ? Math.floor((todayStart.getTime() - oldest.getTime()) / 86_400_000)
            : 0;
        return {
          studentId: r.studentId,
          admissionNo: s?.admission_no ?? null,
          rollNo: s?.roll_no ?? null,
          name: s?.profiles?.full_name ?? null,
          className: cls ? `${cls.name}${cls.section ? " · " + cls.section : ""}` : null,
          parentName: primary?.full_name ?? null,
          parentPhone: primary?.phone ?? null,
          parentEmail: primary?.email ?? null,
          items: r.items,
          assigned: r.assigned,
          paid: r.paid,
          due: r.due,
          oldestDue: r.oldestDue,
          daysOverdue,
        };
      }),
    };
  }

  /** Per-student drill-down grouped by fee head, for the collect sheet. */
  async collectionStudentDetail(actor: AuthUser, studentId: string) {
    this.ensureCollector(actor);
    const student = await this.prisma.students.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        admission_no: true,
        roll_no: true,
        profiles: { select: { full_name: true } },
        classes: { select: { name: true, section: true } },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    const assignments = await this.prisma.fee_assignments.findMany({
      where: { student_id: studentId },
      orderBy: [{ due_date: "asc" }],
      include: { payments: { select: { discount: true, fine: true } } },
    });

    type Row = {
      id: string;
      feesType: string;
      dueDate: Date;
      status: string;
      amount: number;
      paid: number;
      discount: number;
      fine: number;
      balance: number;
    };
    const heads = new Map<string, Row[]>();
    let totalAssigned = 0;
    let totalPaid = 0;
    let totalConcession = 0;
    let totalFine = 0;
    for (const a of assignments) {
      const amount = Number(a.amount_due);
      const paid = Number(a.amount_paid);
      const discount = this.round2(a.payments.reduce((s, p) => s + Number(p.discount), 0));
      const fine = this.round2(a.payments.reduce((s, p) => s + Number(p.fine), 0));
      const row: Row = {
        id: a.id,
        feesType: a.title,
        dueDate: a.due_date,
        status: a.status,
        amount: this.round2(amount),
        paid: this.round2(paid),
        discount,
        fine,
        balance: this.round2(amount - paid),
      };
      totalAssigned += amount;
      totalPaid += paid;
      totalConcession += discount;
      totalFine += fine;
      const list = heads.get(a.title) ?? [];
      list.push(row);
      heads.set(a.title, list);
    }
    const cls = student.classes;
    return {
      student: {
        id: student.id,
        name: student.profiles?.full_name ?? null,
        admissionNo: student.admission_no,
        rollNo: student.roll_no,
        className: cls ? `${cls.name}${cls.section ? " · " + cls.section : ""}` : null,
      },
      summary: {
        totalAssigned: this.round2(totalAssigned),
        totalPaid: this.round2(totalPaid),
        concession: this.round2(totalConcession),
        fine: this.round2(totalFine),
        balanceDue: this.round2(totalAssigned - totalPaid),
      },
      heads: Array.from(heads.entries()).map(([title, rows]) => ({
        title,
        rows,
        subtotal: {
          amount: this.round2(rows.reduce((s, r) => s + r.amount, 0)),
          paid: this.round2(rows.reduce((s, r) => s + r.paid, 0)),
          balance: this.round2(rows.reduce((s, r) => s + r.balance, 0)),
        },
      })),
    };
  }

  /** Batch fee collection across one or more fee heads for a single student. */
  async collectPayments(
    actor: AuthUser,
    dto: {
      studentId: string;
      paymentDate?: string;
      method?: string;
      reference?: string;
      depositAccount?: string;
      receiptNo?: string;
      note?: string;
      lines: { feeAssignmentId: string; paying?: number; discount?: number; fine?: number }[];
    },
  ) {
    this.ensureCollector(actor);
    const lines = (dto.lines ?? []).filter(
      (l) => Number(l.paying ?? 0) > 0 || Number(l.discount ?? 0) > 0 || Number(l.fine ?? 0) > 0,
    );
    if (lines.length === 0)
      throw new BadRequestException("Nothing to collect — enter an amount, discount or fine.");
    const method = (dto.method || "cash").toLowerCase();
    const reference = dto.reference?.trim() || null;
    if (FeesService.NON_CASH.has(method) && !reference) {
      throw new BadRequestException(
        `A reference number is required for ${method} payments (UPI transaction ID, cheque number, or bank reference).`,
      );
    }
    const paidAt = dto.paymentDate ? new Date(dto.paymentDate) : new Date();
    const noteBase = dto.note?.trim() || null;
    const note = dto.receiptNo?.trim()
      ? `${noteBase ? noteBase + " · " : ""}School Receipt: ${dto.receiptNo.trim()}`
      : noteBase;
    const todayStart = new Date(new Date().toISOString().slice(0, 10));

    const created = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const line of lines) {
        const fa = await tx.fee_assignments.findFirst({
          where: { id: line.feeAssignmentId, student_id: dto.studentId },
        });
        if (!fa) throw new NotFoundException("Fee not found for this student");
        const paying = this.round2(Number(line.paying ?? 0));
        const discount = this.round2(Number(line.discount ?? 0));
        const fine = this.round2(Number(line.fine ?? 0));
        // A concession lowers what's owed; a late fine raises it. Clamp at zero.
        const newDue = this.round2(Math.max(0, Number(fa.amount_due) - discount + fine));

        const pay = await tx.payments.create({
          data: {
            student_id: dto.studentId,
            fee_assignment_id: fa.id,
            amount: new Prisma.Decimal(paying),
            method,
            reference,
            discount: new Prisma.Decimal(discount),
            fine: new Prisma.Decimal(fine),
            deposit_account: dto.depositAccount?.trim() || null,
            notes: note,
            payment_source: "offline",
            status: "successful",
            recorded_by: actor.id,
            paid_at: paidAt,
          },
        });

        // Recompute the invoice explicitly (independent of the DB trigger) so
        // amount_due reflects the applied discount/fine.
        const agg = await tx.payments.aggregate({
          where: { fee_assignment_id: fa.id },
          _sum: { amount: true },
        });
        const paidTotal = this.round2(Number(agg._sum.amount ?? 0));
        const balance = this.round2(newDue - paidTotal);
        let status: "paid" | "partial" | "overdue" | "pending";
        if (balance <= 0.009) status = "paid";
        else if (paidTotal > 0 || discount > 0) status = "partial";
        else if (fa.due_date < todayStart) status = "overdue";
        else status = "pending";
        await tx.fee_assignments.update({
          where: { id: fa.id },
          data: {
            amount_due: new Prisma.Decimal(newDue),
            amount_paid: new Prisma.Decimal(paidTotal),
            status: status as never,
          },
        });
        ids.push(pay.id);
      }
      return ids;
    });

    const total = this.round2(lines.reduce((s, l) => s + Number(l.paying ?? 0), 0));
    return { paymentIds: created, count: created.length, total };
  }

  /** Build the combined-receipt payload for a set of payments from one collection. */
  async collectionReceipt(actor: AuthUser, paymentIds: string[]) {
    this.ensureCollector(actor);
    if (paymentIds.length === 0) throw new NotFoundException();
    const payments = await this.prisma.payments.findMany({
      where: { id: { in: paymentIds } },
      orderBy: { paid_at: "asc" },
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
    if (payments.length === 0) throw new NotFoundException();
    const first = payments[0];
    const cls = first.students?.classes;
    let schoolReceiptNo: string | null = null;
    let displayNote: string | null = first.notes;
    const m = first.notes?.match(/School Receipt:\s*(.+)$/);
    if (m) {
      schoolReceiptNo = m[1].trim();
      displayNote = first.notes!.replace(/(?:\s*·\s*)?School Receipt:\s*.+$/, "").trim() || null;
    }
    return {
      receiptNo: first.receipt_no,
      schoolReceiptNo,
      paidAt: first.paid_at,
      studentName: first.students?.profiles?.full_name ?? null,
      admissionNo: first.students?.admission_no ?? null,
      className: cls ? `${cls.name}${cls.section ? " · " + cls.section : ""}` : null,
      method: first.method,
      reference: first.reference,
      depositAccount: first.deposit_account,
      note: displayNote,
      lines: payments.map((p) => ({
        feeTitle: p.fee_assignments?.title ?? "Fee",
        paying: Number(p.amount),
        discount: Number(p.discount),
        fine: Number(p.fine),
      })),
      total: this.round2(payments.reduce((s, p) => s + Number(p.amount), 0)),
    };
  }

  /** Send fee-due reminders to the guardians of the selected students. */
  async sendReminders(
    actor: AuthUser,
    dto: { studentIds: string[]; channels: string[]; message?: string },
  ) {
    this.ensureCollector(actor);
    const studentIds = Array.from(new Set(dto.studentIds ?? [])).filter(Boolean);
    if (studentIds.length === 0) throw new BadRequestException("Select at least one student.");
    const channels = (dto.channels ?? []).filter((c) =>
      ["sms", "whatsapp", "email", "in_app"].includes(c),
    );
    if (channels.length === 0) throw new BadRequestException("Choose at least one channel.");

    const grouped = await this.prisma.fee_assignments.groupBy({
      by: ["student_id"],
      where: { student_id: { in: studentIds } },
      _sum: { amount_due: true, amount_paid: true },
    });
    const dueById = new Map(
      grouped.map((g) => [
        g.student_id,
        this.round2(Number(g._sum.amount_due ?? 0) - Number(g._sum.amount_paid ?? 0)),
      ]),
    );
    const students = await this.prisma.students.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        profiles: { select: { full_name: true } },
        parent_student: {
          select: { profiles: { select: { id: true, phone: true, email: true } } },
        },
      },
    });
    const items = students.map((s) => {
      const parents = s.parent_student.map((ps) => ps.profiles);
      return {
        studentId: s.id,
        studentName: s.profiles?.full_name ?? "Student",
        amount: Math.max(0, dueById.get(s.id) ?? 0),
        parentUserIds: parents.map((p) => p.id),
        phones: parents.map((p) => p.phone).filter((v): v is string => !!v),
        emails: parents.map((p) => p.email).filter((v): v is string => !!v),
      };
    });
    return this.notifications.sendFeeReminders({
      senderId: actor.id,
      channels: channels as ("sms" | "whatsapp" | "email" | "in_app")[],
      items,
      message: dto.message,
    });
  }

  /** Recent reminder history for one student (audit). */
  async reminderHistory(actor: AuthUser, studentId: string) {
    this.ensureCollector(actor);
    const rows = await this.prisma.fee_reminders.findMany({
      where: { student_id: studentId },
      orderBy: { created_at: "desc" },
      take: 20,
    });
    return rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      amount: Number(r.amount),
      delivered: r.delivered,
      sentAt: r.created_at,
    }));
  }

  // ============================ Fee Types ============================

  private feeTypeRow(t: {
    id: string;
    name: string;
    category: string;
    description: string | null;
    is_active: boolean;
    created_at: Date;
  }) {
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      description: t.description,
      isActive: t.is_active,
      createdAt: t.created_at,
    };
  }

  async listFeeTypes(includeInactive = false) {
    const rows = await this.prisma.fee_types.findMany({
      where: includeInactive ? {} : { is_active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => this.feeTypeRow(r));
  }

  async createFeeType(dto: { name: string; category?: string; description?: string }) {
    const row = await this.prisma.fee_types.create({
      data: {
        name: dto.name.trim(),
        category: dto.category?.trim() || "other",
        description: dto.description?.trim() || null,
      },
    });
    return this.feeTypeRow(row);
  }

  async updateFeeType(
    id: string,
    dto: { name?: string; category?: string; description?: string; isActive?: boolean },
  ) {
    const existing = await this.prisma.fee_types.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Fee type not found");
    const row = await this.prisma.fee_types.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category.trim() || "other" } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });
    return this.feeTypeRow(row);
  }

  async deleteFeeType(id: string) {
    const existing = await this.prisma.fee_types.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Fee type not found");
    await this.prisma.fee_types.delete({ where: { id } });
    return { ok: true };
  }

  // ============================ Fee Groups ============================

  private groupInclude = {
    classes: { select: { name: true, section: true } },
    fee_group_components: {
      orderBy: { sort_order: "asc" as const },
      include: { fee_types: { select: { name: true } } },
    },
  };

  private feeGroupRow(g: any) {
    const components = (g.fee_group_components ?? []).map((c: any) => ({
      id: c.id,
      feeTypeId: c.fee_type_id,
      feeTypeName: c.fee_types?.name ?? null,
      label: c.label,
      amount: Number(c.amount),
      dueDate: c.due_date,
      demandDate: c.demand_date,
      fineAmount: Number(c.fine_amount),
      fineAfterDays: c.fine_after_days,
    }));
    return {
      id: g.id,
      name: g.name,
      academicYear: g.academic_year,
      classId: g.class_id,
      className: g.classes
        ? `${g.classes.name}${g.classes.section ? " · " + g.classes.section : ""}`
        : null,
      isArchived: g.is_archived,
      total: this.round2(components.reduce((s: number, c: any) => s + c.amount, 0)),
      components,
    };
  }

  private componentData(components: any[]) {
    return (components ?? []).map((c, i) => ({
      fee_type_id: c.feeTypeId ?? null,
      label: c.label.trim(),
      amount: this.round2(Number(c.amount) || 0),
      due_date: c.dueDate ? new Date(c.dueDate) : null,
      demand_date: c.demandDate ? new Date(c.demandDate) : null,
      fine_amount: this.round2(Number(c.fineAmount) || 0),
      fine_after_days: c.fineAfterDays != null ? Number(c.fineAfterDays) : null,
      sort_order: i,
    }));
  }

  async listFeeGroups(includeArchived = false) {
    const rows = await this.prisma.fee_groups.findMany({
      where: includeArchived ? {} : { is_archived: false },
      orderBy: { created_at: "desc" },
      include: this.groupInclude,
    });
    return rows.map((r) => this.feeGroupRow(r));
  }

  async getFeeGroup(id: string) {
    const row = await this.prisma.fee_groups.findUnique({
      where: { id },
      include: this.groupInclude,
    });
    if (!row) throw new NotFoundException("Fee group not found");
    return this.feeGroupRow(row);
  }

  async createFeeGroup(dto: {
    name: string;
    academicYear?: string;
    classId?: string;
    components: any[];
  }) {
    const row = await this.prisma.fee_groups.create({
      data: {
        name: dto.name.trim(),
        academic_year: dto.academicYear?.trim() || "2025-2026",
        class_id: dto.classId ?? null,
        fee_group_components: { create: this.componentData(dto.components) },
      },
      include: this.groupInclude,
    });
    return this.feeGroupRow(row);
  }

  async updateFeeGroup(
    id: string,
    dto: { name?: string; academicYear?: string; classId?: string; components?: any[] },
  ) {
    const existing = await this.prisma.fee_groups.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Fee group not found");
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.fee_groups.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.academicYear !== undefined ? { academic_year: dto.academicYear.trim() } : {}),
          ...(dto.classId !== undefined ? { class_id: dto.classId || null } : {}),
        },
      });
      // Full replace of components when provided.
      if (dto.components) {
        await tx.fee_group_components.deleteMany({ where: { group_id: id } });
        for (const c of this.componentData(dto.components)) {
          await tx.fee_group_components.create({ data: { ...c, group_id: id } });
        }
      }
      return tx.fee_groups.findUnique({ where: { id }, include: this.groupInclude });
    });
    return this.feeGroupRow(row);
  }

  async cloneFeeGroup(id: string, name?: string) {
    const src = await this.prisma.fee_groups.findUnique({
      where: { id },
      include: { fee_group_components: { orderBy: { sort_order: "asc" } } },
    });
    if (!src) throw new NotFoundException("Fee group not found");
    const row = await this.prisma.fee_groups.create({
      data: {
        name: name?.trim() || `${src.name} (Copy)`,
        academic_year: src.academic_year,
        class_id: src.class_id,
        fee_group_components: {
          create: src.fee_group_components.map((c, i) => ({
            fee_type_id: c.fee_type_id,
            label: c.label,
            amount: c.amount,
            due_date: c.due_date,
            demand_date: c.demand_date,
            fine_amount: c.fine_amount,
            fine_after_days: c.fine_after_days,
            sort_order: i,
          })),
        },
      },
      include: this.groupInclude,
    });
    return this.feeGroupRow(row);
  }

  async archiveFeeGroup(id: string, archived: boolean) {
    const existing = await this.prisma.fee_groups.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Fee group not found");
    const row = await this.prisma.fee_groups.update({
      where: { id },
      data: { is_archived: archived },
      include: this.groupInclude,
    });
    return this.feeGroupRow(row);
  }

  async deleteFeeGroup(id: string) {
    const existing = await this.prisma.fee_groups.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Fee group not found");
    await this.prisma.fee_groups.delete({ where: { id } });
    return { ok: true };
  }
}

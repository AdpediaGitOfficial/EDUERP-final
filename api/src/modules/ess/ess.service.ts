import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * Employee Self-Service. Every endpoint is scoped to the caller's OWN staff
 * record (staff.profile_id = auth uid), exactly as the RLS self-policies do
 * (ec_self / gr_self / staff_read_own_* / tra_self). A user with no linked
 * staff record reads empty lists; writes fail with a clear 400.
 */
@Injectable()
export class EssService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private num(v: unknown): number {
    return v == null ? 0 : Number(v);
  }
  private dstr(d: Date | null | undefined): string | null {
    return d ? d.toISOString().slice(0, 10) : null;
  }

  private async ownStaff(actor: AuthUser) {
    return this.prisma.staff.findFirst({ where: { profile_id: actor.id } });
  }
  private async ownStaffId(actor: AuthUser): Promise<string | null> {
    const s = await this.prisma.staff.findFirst({
      where: { profile_id: actor.id },
      select: { id: true },
    });
    return s?.id ?? null;
  }
  private async requireStaffId(actor: AuthUser): Promise<string> {
    const id = await this.ownStaffId(actor);
    if (!id) throw new BadRequestException("No employee record is linked to your account.");
    return id;
  }

  // ---- Profile / dashboard ------------------------------------------------
  async me(actor: AuthUser) {
    const s = await this.ownStaff(actor);
    if (!s) return null;
    return {
      id: s.id,
      employee_code: s.employee_code,
      full_name: s.full_name,
      email: s.email,
      phone: s.phone,
      address: s.address,
      department: s.department,
      designation: s.designation,
      employment_type: s.employment_type,
      status: s.status,
      join_date: this.dstr(s.join_date),
      dob: this.dstr(s.dob),
      blood_group: s.blood_group,
      photo_url: s.photo_url,
      confirmation_status: s.confirmation_status,
      emergency_contact: s.emergency_contact,
      bank_details: s.bank_details,
      skills: s.skills ?? [],
    };
  }

  async summary(actor: AuthUser) {
    const s = await this.ownStaff(actor);
    if (!s) return { staff: null };
    const [leaves, payroll] = await Promise.all([
      this.prisma.leave_requests.findMany({ where: { staff_id: s.id }, select: { status: true } }),
      this.prisma.payroll_runs.findMany({
        where: { staff_id: s.id },
        orderBy: { month: "desc" },
        take: 3,
        select: { net_salary: true, status: true, month: true },
      }),
    ]);
    return {
      staff: {
        id: s.id,
        employee_code: s.employee_code,
        full_name: s.full_name,
        designation: s.designation,
        department: s.department,
        status: s.status,
      },
      pendingLeaves: leaves.filter((l) => l.status === "pending").length,
      lastNet: payroll[0] ? this.num(payroll[0].net_salary) : null,
    };
  }

  // ---- Leave --------------------------------------------------------------
  async leave(actor: AuthUser) {
    const staffId = await this.ownStaffId(actor);
    if (!staffId) return { requests: [], balances: [] };
    const [requests, balances] = await Promise.all([
      this.prisma.leave_requests.findMany({
        where: { staff_id: staffId },
        orderBy: { start_date: "desc" },
      }),
      this.prisma.leave_balances.findMany({ where: { staff_id: staffId } }),
    ]);
    return {
      requests: requests.map((r) => ({
        id: r.id,
        leave_type: r.leave_type,
        start_date: this.dstr(r.start_date),
        end_date: this.dstr(r.end_date),
        days: r.days,
        status: r.status,
        reason: r.reason,
        approver_comment: r.approver_comment,
      })),
      balances: balances.map((b) => ({
        id: b.id,
        year: b.year,
        leave_type: b.leave_type,
        allotted: b.allotted,
        used: b.used,
      })),
    };
  }

  async applyLeave(
    actor: AuthUser,
    input: { leave_type: string; start_date: string; end_date: string; reason?: string },
  ) {
    const staffId = await this.requireStaffId(actor);
    if (!input.start_date || !input.end_date) throw new BadRequestException("Dates are required.");
    const start = new Date(input.start_date);
    const end = new Date(input.end_date);
    if (end < start) throw new BadRequestException("End date can't be before the start date.");
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const row = await this.prisma.leave_requests.create({
      data: {
        staff_id: staffId,
        leave_type: input.leave_type,
        start_date: start,
        end_date: end,
        days,
        reason: input.reason || null,
        status: "pending",
      },
    });
    return { id: row.id };
  }

  // ---- Payslips -----------------------------------------------------------
  async payslips(actor: AuthUser) {
    const staffId = await this.ownStaffId(actor);
    if (!staffId) return [];
    const rows = await this.prisma.payroll_runs.findMany({
      where: { staff_id: staffId },
      orderBy: { month: "desc" },
    });
    return rows.map((p) => ({
      id: p.id,
      month: p.month,
      base_salary: this.num(p.base_salary),
      allowances: this.num(p.allowances),
      deductions: this.num(p.deductions),
      net_salary: this.num(p.net_salary),
      status: p.status,
      pay_date: this.dstr(p.pay_date),
    }));
  }

  // ---- Attendance (teaching staff; resolved by email like the page) -------
  async attendance(actor: AuthUser) {
    const teacher = await this.prisma.teachers.findFirst({
      where: { email: { equals: actor.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (!teacher) return { teacher: null, rows: [] };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await this.prisma.teacher_attendance.findMany({
      where: { teacher_id: teacher.id },
      orderBy: { date: "desc" },
      take: 60,
    });
    const todayIso = today.toISOString().slice(0, 10);
    return {
      teacher: { id: teacher.id },
      rows: rows.map((a) => ({
        id: a.id,
        date: this.dstr(a.date),
        status: a.status,
        check_in_time: a.check_in_time ? a.check_in_time.toISOString() : null,
        marked_by: a.marked_by,
        correction_reason: a.correction_reason,
      })),
      todayMarked: rows.some((a) => this.dstr(a.date) === todayIso),
    };
  }

  // ---- Expenses -----------------------------------------------------------
  async expenses(actor: AuthUser) {
    const staffId = await this.ownStaffId(actor);
    if (!staffId) return [];
    const rows = await this.prisma.expense_claims.findMany({
      where: { staff_id: staffId },
      orderBy: { claim_date: "desc" },
    });
    return rows.map((e) => ({
      id: e.id,
      category: e.category,
      amount: this.num(e.amount),
      claim_date: this.dstr(e.claim_date),
      status: e.status,
      notes: e.notes,
    }));
  }

  async submitExpense(
    actor: AuthUser,
    input: { category: string; amount: number; notes?: string },
  ) {
    const staffId = await this.requireStaffId(actor);
    if (!(input.amount > 0)) throw new BadRequestException("Amount must be greater than zero.");
    const row = await this.prisma.expense_claims.create({
      data: {
        staff_id: staffId,
        category: input.category,
        amount: input.amount,
        notes: input.notes || null,
        status: "pending",
      },
    });
    return { id: row.id };
  }

  // ---- Grievances ---------------------------------------------------------
  async grievances(actor: AuthUser) {
    const staffId = await this.ownStaffId(actor);
    if (!staffId) return [];
    const rows = await this.prisma.grievances.findMany({
      where: { staff_id: staffId },
      orderBy: { created_at: "desc" },
    });
    return rows.map((g) => ({
      id: g.id,
      subject: g.subject,
      message: g.message,
      status: g.status,
      response: g.response,
      created_at: g.created_at ? g.created_at.toISOString() : null,
    }));
  }

  async submitGrievance(actor: AuthUser, input: { subject: string; message: string }) {
    const staffId = await this.requireStaffId(actor);
    if (!input.subject?.trim() || !input.message?.trim())
      throw new BadRequestException("Subject and message are required.");
    const row = await this.prisma.grievances.create({
      data: { staff_id: staffId, subject: input.subject, message: input.message, status: "open" },
    });
    return { id: row.id };
  }

  // ---- Documents ----------------------------------------------------------
  async documents(actor: AuthUser) {
    const staffId = await this.ownStaffId(actor);
    if (!staffId) return [];
    const rows = await this.prisma.staff_documents.findMany({
      where: { staff_id: staffId },
      orderBy: { uploaded_at: "desc" },
    });
    return rows.map((d) => ({
      id: d.id,
      doc_type: d.doc_type,
      title: d.title,
      file_url: d.file_url,
      uploaded_at: d.uploaded_at ? d.uploaded_at.toISOString() : null,
      expiry_date: this.dstr(d.expiry_date),
    }));
  }

  // ---- Performance reviews (resolve own teacher) --------------------------
  async performance(actor: AuthUser) {
    const staffId = await this.ownStaffId(actor);
    if (!staffId) return [];
    const teacher = await this.prisma.teachers.findFirst({
      where: { staff_id: staffId },
      select: { id: true },
    });
    if (!teacher) return [];
    const rows = await this.prisma.teacher_performance_reviews.findMany({
      where: { teacher_id: teacher.id },
      orderBy: { period: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      period: r.period,
      rating: r.rating == null ? null : this.num(r.rating),
      notes: r.notes,
    }));
  }

  // ---- Training -----------------------------------------------------------
  async training(actor: AuthUser) {
    const staffId = await this.ownStaffId(actor);
    if (!staffId) return [];
    const rows = await this.prisma.training_attendance.findMany({
      where: { staff_id: staffId },
      include: {
        training_programs: {
          select: {
            title: true,
            start_date: true,
            end_date: true,
            program_type: true,
            provider: true,
          },
        },
      },
    });
    return rows.map((t) => ({
      id: t.id,
      attended: t.attended,
      feedback: t.feedback,
      rating: t.rating == null ? null : this.num(t.rating),
      program: t.training_programs
        ? {
            title: t.training_programs.title,
            start_date: this.dstr(t.training_programs.start_date),
            end_date: this.dstr(t.training_programs.end_date),
            program_type: t.training_programs.program_type,
            provider: t.training_programs.provider,
          }
        : null,
    }));
  }

  // ---- Assets assigned to me ---------------------------------------------
  async assets(actor: AuthUser) {
    const rows = await this.prisma.assets.findMany({
      where: { assigned_to_profile_id: actor.id },
      orderBy: { name: "asc" },
    });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      asset_code: a.asset_code,
      category: a.category,
      status: a.status,
      condition: a.condition,
      assigned_to_label: a.assigned_to_label,
    }));
  }
}

import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

export interface StaffInput {
  employee_code: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  department: string;
  designation: string;
  employment_type?: string;
  join_date?: string;
  status?: string;
  confirmation_status?: string;
}
export interface DepartmentInput {
  name: string;
  code: string;
  budget?: number;
  description?: string | null;
}
export interface DesignationInput {
  title: string;
  level?: number;
  salary_grade?: string | null;
  min_pay?: number | null;
  max_pay?: number | null;
}

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   leave_requests:    hr_admin_lr (hr|admin ALL); staff_read_own_lr / staff_create_own_lr
 *   leave_balances:    hr_admin_lb; staff_read_own_lb
 *   payroll_runs:      hr_admin_pr; accountant_read_pr; staff_read_own_pr
 *   salary_structures: hr_admin_ss; accountant_read_ss
 *   expense_claims:    ec_hr (admin|hr|accountant ALL); ec_self (read own); ec_self_insert
 * "Own" rows resolve through staff.profile_id = auth uid, exactly as the policies do.
 */
@Injectable()
export class HrService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private isHr(actor: AuthUser) {
    return actor.roles.some((r) => r === "admin" || r === "hr");
  }

  /**
   * HR dashboard aggregation — ports the six client-side queries in hr.index.tsx
   * into one endpoint. HR/admin only (staff/payroll/leave visibility is hr_admin_*).
   */
  async dashboard(actor: AuthUser) {
    if (!this.isHr(actor)) throw new ForbiddenException();
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [staff, leaves, payroll, jobs, reviews, attn] = await Promise.all([
      this.prisma.staff.findMany({ select: { status: true, department: true } }),
      this.prisma.leave_requests.findMany({ select: { status: true } }),
      this.prisma.payroll_runs.findMany({ select: { status: true, net_salary: true } }),
      this.prisma.job_openings.findMany({ select: { status: true, positions: true } }),
      this.prisma.teacher_performance_reviews.findMany({ select: { rating: true } }),
      this.prisma.teacher_attendance.findMany({
        where: { date: { gte: since } },
        select: { status: true },
      }),
    ]);

    const total = staff.length;
    const active = staff.filter((s) => s.status === "active").length;
    const onLeave = staff.filter((s) => s.status === "on_leave").length;
    const teachers = staff.filter((s) => s.department === "Academics").length;
    const present = attn.filter((a) => a.status === "present").length;
    const late = attn.filter((a) => a.status === "late").length;
    const byDept = staff.reduce<Record<string, number>>((acc, s) => {
      const k = s.department ?? "—";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});

    return {
      total,
      active,
      onLeave,
      teachers,
      nonTeaching: total - teachers,
      pendingLeaves: leaves.filter((l) => l.status === "pending").length,
      pendingPayroll: payroll.filter((p) => p.status === "pending").length,
      disbursed: payroll
        .filter((p) => p.status === "paid")
        .reduce((a, p) => a + Number(p.net_salary ?? 0), 0),
      openPositions: jobs
        .filter((j) => j.status === "open")
        .reduce((a, j) => a + Number(j.positions ?? 0), 0),
      avgRating: reviews.length
        ? Number(
            (reviews.reduce((a, r) => a + Number(r.rating ?? 0), 0) / reviews.length).toFixed(1),
          )
        : null,
      attendancePct: attn.length ? Math.round((present / attn.length) * 100) : 0,
      lateArrivals: late,
      byDepartment: Object.entries(byDept).map(([name, value]) => ({ name, value })),
    };
  }

  private async ownStaffId(actor: AuthUser): Promise<string | null> {
    const row = await this.prisma.staff.findFirst({
      where: { profile_id: actor.id },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async listLeaveRequests(actor: AuthUser, page = 1, pageSize = 50, status?: string) {
    let scope: Prisma.leave_requestsWhereInput;
    if (this.isHr(actor)) scope = {};
    else {
      const staffId = await this.ownStaffId(actor);
      if (!staffId) return { total: 0, page, pageSize, rows: [] };
      scope = { staff_id: staffId };
    }
    const where: Prisma.leave_requestsWhereInput = { AND: [scope, status ? { status } : {}] };
    const [total, rows] = await Promise.all([
      this.prisma.leave_requests.count({ where }),
      this.prisma.leave_requests.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          staff_leave_requests_staff_idTostaff: {
            select: { full_name: true, employee_code: true, department: true },
          },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((l) => ({
        id: l.id,
        staffId: l.staff_id,
        staffName: l.staff_leave_requests_staff_idTostaff?.full_name ?? null,
        employeeCode: l.staff_leave_requests_staff_idTostaff?.employee_code ?? null,
        department: l.staff_leave_requests_staff_idTostaff?.department ?? null,
        leaveType: l.leave_type,
        startDate: l.start_date,
        endDate: l.end_date,
        days: l.days,
        status: l.status,
        reason: l.reason,
        createdAt: l.created_at,
      })),
    };
  }

  async createLeaveRequest(
    actor: AuthUser,
    data: { leaveType: string; fromDate: string; toDate: string; reason?: string },
  ) {
    // staff_create_own_lr: any staff member files their own request.
    const staffId = await this.ownStaffId(actor);
    if (!staffId) throw new ForbiddenException("No staff record linked to this account");
    const start = new Date(data.fromDate);
    const end = new Date(data.toDate);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const row = await this.prisma.leave_requests.create({
      data: {
        staff_id: staffId,
        leave_type: data.leaveType,
        start_date: start,
        end_date: end,
        days,
        reason: data.reason ?? null,
      },
    });
    return { id: row.id };
  }

  async decideLeaveRequest(actor: AuthUser, id: string, status: "approved" | "rejected") {
    // hr_admin_lr is the only ALL policy — approval authority is hr|admin.
    if (!this.isHr(actor)) throw new ForbiddenException();
    // approver_id -> staff.id (not the profile id); null when the approver (e.g. an
    // admin) has no linked staff record, exactly as the FK allows.
    const approverStaffId = await this.ownStaffId(actor);
    await this.prisma.leave_requests.update({
      where: { id },
      data: { status, approver_id: approverStaffId, decided_at: new Date() },
    });
    return { ok: true };
  }

  async listLeaveBalances(actor: AuthUser, staffId?: string) {
    let where: Prisma.leave_balancesWhereInput;
    if (this.isHr(actor)) where = staffId ? { staff_id: staffId } : {};
    else {
      const own = await this.ownStaffId(actor);
      if (!own) return [];
      where = { staff_id: own };
    }
    const rows = await this.prisma.leave_balances.findMany({
      where,
      take: 500,
      orderBy: { year: "desc" },
      include: { staff: { select: { full_name: true, employee_code: true } } },
    });
    return rows.map((b) => ({
      id: b.id,
      staffId: b.staff_id,
      staff: b.staff
        ? { full_name: b.staff.full_name, employee_code: b.staff.employee_code }
        : null,
      year: b.year,
      leave_type: b.leave_type,
      allotted: b.allotted,
      used: b.used,
    }));
  }

  async listPayrollRuns(actor: AuthUser, page = 1, pageSize = 50) {
    let scope: Prisma.payroll_runsWhereInput;
    if (this.isHr(actor) || actor.roles.includes("accountant")) scope = {};
    else {
      const staffId = await this.ownStaffId(actor);
      if (!staffId) return { total: 0, page, pageSize, rows: [] };
      scope = { staff_id: staffId };
    }
    const [total, rows] = await Promise.all([
      this.prisma.payroll_runs.count({ where: scope }),
      this.prisma.payroll_runs.findMany({
        where: scope,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          staff: { select: { full_name: true, employee_code: true, designation: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((p) => ({
        id: p.id,
        staffId: p.staff_id,
        staffName: p.staff?.full_name ?? null,
        employeeCode: p.staff?.employee_code ?? null,
        designation: p.staff?.designation ?? null,
        month: p.month,
        baseSalary: p.base_salary,
        allowances: p.allowances,
        deductions: p.deductions,
        netSalary: p.net_salary,
        status: p.status,
        payDate: p.pay_date,
      })),
    };
  }

  async listExpenseClaims(actor: AuthUser, page = 1, pageSize = 50) {
    let scope: Prisma.expense_claimsWhereInput;
    if (actor.roles.some((r) => r === "admin" || r === "hr" || r === "accountant")) scope = {};
    else {
      const staffId = await this.ownStaffId(actor);
      if (!staffId) return { total: 0, page, pageSize, rows: [] };
      scope = { staff_id: staffId };
    }
    const [total, rows] = await Promise.all([
      this.prisma.expense_claims.count({ where: scope }),
      this.prisma.expense_claims.findMany({
        where: scope,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          staff_expense_claims_staff_idTostaff: {
            select: { full_name: true, employee_code: true, department: true },
          },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((e) => ({
        id: e.id,
        staffId: e.staff_id,
        staffName: e.staff_expense_claims_staff_idTostaff?.full_name ?? null,
        employeeCode: e.staff_expense_claims_staff_idTostaff?.employee_code ?? null,
        department: e.staff_expense_claims_staff_idTostaff?.department ?? null,
        category: e.category,
        amount: e.amount,
        claimDate: e.claim_date,
        status: e.status,
        notes: e.notes,
      })),
    };
  }

  /** ec_hr is the ALL policy — admin|hr|accountant approve/reject claims. */
  async decideExpenseClaim(actor: AuthUser, id: string, status: "approved" | "rejected") {
    if (!actor.roles.some((r) => r === "admin" || r === "hr" || r === "accountant")) {
      throw new ForbiddenException();
    }
    const existing = await this.prisma.expense_claims.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Expense claim not found");
    // approver_id -> staff.id; null when the approver has no linked staff record.
    const approverStaffId = await this.ownStaffId(actor);
    await this.prisma.expense_claims.update({
      where: { id },
      data: { status, approver_id: approverStaffId },
    });
    return { ok: true };
  }

  // ==== Staff directory (hr_admin_all_staff) ================================
  private requireHr(actor: AuthUser) {
    if (!this.isHr(actor)) throw new ForbiddenException();
  }

  /** Full directory — hr|admin only (hr_admin_all_staff / staff_read_own is per-row). */
  async listStaff(actor: AuthUser) {
    this.requireHr(actor);
    return this.prisma.staff.findMany({ orderBy: { employee_code: "asc" } });
  }

  private mapStaffInput(input: StaffInput) {
    return {
      employee_code: input.employee_code,
      full_name: input.full_name,
      email: input.email || null,
      phone: input.phone || null,
      department: input.department,
      designation: input.designation,
      employment_type: input.employment_type || "full_time",
      join_date: input.join_date ? new Date(input.join_date) : new Date(),
      status: input.status || "active",
      confirmation_status: input.confirmation_status || "probation",
    };
  }

  async createStaff(actor: AuthUser, input: StaffInput) {
    this.requireHr(actor);
    try {
      const row = await this.prisma.staff.create({ data: this.mapStaffInput(input) });
      return { id: row.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("That employee code is already in use.");
      throw e;
    }
  }

  async updateStaff(actor: AuthUser, id: string, input: StaffInput) {
    this.requireHr(actor);
    const existing = await this.prisma.staff.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Employee not found");
    try {
      await this.prisma.$transaction([
        this.prisma.staff.update({ where: { id }, data: this.mapStaffInput(input) }),
        this.prisma.staff_employment_history.create({
          data: {
            staff_id: id,
            event_type: "revised",
            effective_date: new Date(),
            notes: "Profile updated",
          },
        }),
      ]);
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("That employee code is already in use.");
      throw e;
    }
  }

  async setStaffStatus(actor: AuthUser, id: string, status: string) {
    this.requireHr(actor);
    const existing = await this.prisma.staff.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Employee not found");
    if (existing.status === status) return { ok: true };
    const eventType =
      status === "inactive"
        ? "deactivated"
        : status === "active"
          ? "reactivated"
          : "status_changed";
    await this.prisma.$transaction([
      this.prisma.staff.update({ where: { id }, data: { status } }),
      this.prisma.staff_employment_history.create({
        data: {
          staff_id: id,
          event_type: eventType,
          effective_date: new Date(),
          from_value: existing.status,
          to_value: status,
        },
      }),
    ]);
    return { ok: true };
  }

  /** Single-employee detail bundle — hr|admin, or the employee themselves. */
  async staffDetail(actor: AuthUser, id: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id } });
    if (!staff) throw new NotFoundException("Employee not found");
    if (!this.isHr(actor) && staff.profile_id !== actor.id) throw new ForbiddenException();
    const [payroll, leaves, documents, history, expenses] = await Promise.all([
      this.prisma.payroll_runs.findMany({ where: { staff_id: id }, orderBy: { month: "desc" } }),
      this.prisma.leave_requests.findMany({
        where: { staff_id: id },
        orderBy: { start_date: "desc" },
      }),
      this.prisma.staff_documents.findMany({
        where: { staff_id: id },
        orderBy: { uploaded_at: "desc" },
      }),
      this.prisma.staff_employment_history.findMany({
        where: { staff_id: id },
        orderBy: { effective_date: "desc" },
      }),
      this.prisma.expense_claims.findMany({
        where: { staff_id: id },
        orderBy: { claim_date: "desc" },
      }),
    ]);
    const assets = staff.profile_id
      ? await this.prisma.assets.findMany({
          where: { assigned_to_profile_id: staff.profile_id },
          select: { id: true, asset_code: true, name: true, status: true, condition: true },
          orderBy: { name: "asc" },
        })
      : [];
    return { staff, payroll, leaves, documents, history, assets, expenses };
  }

  // ==== Departments (dept_read true / dept_write hr|admin) ==================
  listDepartments() {
    return this.prisma.departments.findMany({ orderBy: { name: "asc" } });
  }

  async createDepartment(actor: AuthUser, input: DepartmentInput) {
    this.requireHr(actor);
    try {
      const row = await this.prisma.departments.create({
        data: {
          name: input.name,
          code: input.code,
          budget: input.budget ?? 0,
          description: input.description || null,
        },
      });
      return { id: row.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("A department with that name or code already exists.");
      throw e;
    }
  }

  async updateDepartment(actor: AuthUser, id: string, input: DepartmentInput) {
    this.requireHr(actor);
    try {
      await this.prisma.departments.update({
        where: { id },
        data: {
          name: input.name,
          code: input.code,
          budget: input.budget ?? 0,
          description: input.description || null,
        },
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") throw new NotFoundException("Department not found");
        if (e.code === "P2002")
          throw new ConflictException("A department with that name or code already exists.");
      }
      throw e;
    }
  }

  async deleteDepartment(actor: AuthUser, id: string) {
    this.requireHr(actor);
    try {
      await this.prisma.departments.delete({ where: { id } });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") throw new NotFoundException("Department not found");
        if (e.code === "P2003")
          throw new ConflictException("Remove or reassign linked designations first.");
      }
      throw e;
    }
  }

  // ==== Designations (desig_read true / desig_write hr|admin) ===============
  listDesignations() {
    return this.prisma.designations.findMany({ orderBy: [{ level: "desc" }, { title: "asc" }] });
  }

  private mapDesignationInput(input: DesignationInput) {
    return {
      title: input.title,
      level: input.level ?? 1,
      salary_grade: input.salary_grade || null,
      min_pay: input.min_pay ?? null,
      max_pay: input.max_pay ?? null,
    };
  }

  async createDesignation(actor: AuthUser, input: DesignationInput) {
    this.requireHr(actor);
    try {
      const row = await this.prisma.designations.create({ data: this.mapDesignationInput(input) });
      return { id: row.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("A designation with that title already exists.");
      throw e;
    }
  }

  async updateDesignation(actor: AuthUser, id: string, input: DesignationInput) {
    this.requireHr(actor);
    try {
      await this.prisma.designations.update({
        where: { id },
        data: this.mapDesignationInput(input),
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2025") throw new NotFoundException("Designation not found");
        if (e.code === "P2002")
          throw new ConflictException("A designation with that title already exists.");
      }
      throw e;
    }
  }

  async deleteDesignation(actor: AuthUser, id: string) {
    this.requireHr(actor);
    try {
      await this.prisma.designations.delete({ where: { id } });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
        throw new NotFoundException("Designation not found");
      throw e;
    }
  }
}

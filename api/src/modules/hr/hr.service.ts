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
  // Personal / statutory record
  gender?: string | null;
  marital_status?: string | null;
  dob?: string | null;
  blood_group?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  address?: string | null;
  biometric_id?: string | null;
  staff_category?: string | null;
  probation_end_date?: string | null;
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
    // The seed's teaching department is "Academic"; match case-insensitively on
    // the prefix so "Academic"/"Academics" both count (the old exact "Academics"
    // check silently returned 0 against the real data).
    const teachers = staff.filter((s) =>
      (s.department ?? "").toLowerCase().startsWith("academic"),
    ).length;
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
      gender: input.gender || null,
      marital_status: input.marital_status || null,
      dob: input.dob ? new Date(input.dob) : null,
      blood_group: input.blood_group || null,
      father_name: input.father_name || null,
      mother_name: input.mother_name || null,
      address: input.address || null,
      biometric_id: input.biometric_id?.trim() || null,
      staff_category: input.staff_category || null,
      probation_end_date: input.probation_end_date ? new Date(input.probation_end_date) : null,
    };
  }

  async createStaff(actor: AuthUser, input: StaffInput) {
    this.requireHr(actor);
    try {
      const row = await this.prisma.staff.create({ data: this.mapStaffInput(input) });
      return { id: row.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String(e.meta?.target ?? "");
        throw new ConflictException(
          target.includes("biometric")
            ? "That biometric ID is already assigned to another employee."
            : "That employee code is already in use.",
        );
      }
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
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String(e.meta?.target ?? "");
        throw new ConflictException(
          target.includes("biometric")
            ? "That biometric ID is already assigned to another employee."
            : "That employee code is already in use.",
        );
      }
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

  /** List an employee's documents — hr|admin, or the employee themselves. */
  async listStaffDocuments(actor: AuthUser, staffId: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException("Employee not found");
    if (!this.isHr(actor) && staff.profile_id !== actor.id) throw new ForbiddenException();
    return this.prisma.staff_documents.findMany({
      where: { staff_id: staffId },
      orderBy: { uploaded_at: "desc" },
    });
  }

  /**
   * Attach an uploaded document to an employee (hr|admin only). `fileUrl` is the
   * URL returned by POST /files; this just records the row that references it.
   */
  async addStaffDocument(
    actor: AuthUser,
    staffId: string,
    docType: string,
    fileUrl: string,
    title?: string,
  ) {
    if (!this.isHr(actor)) throw new ForbiddenException();
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException("Employee not found");
    return this.prisma.staff_documents.create({
      data: { staff_id: staffId, doc_type: docType, title: title?.trim() || docType, file_url: fileUrl },
    });
  }

  // ==== Departments (dept_read true / dept_write hr|admin) ==================
  listDepartments() {
    return this.prisma.departments.findMany({ orderBy: { name: "asc" } });
  }

  // ---- Org-setup masters (employment types / pay grades / leave types) ----
  listEmploymentTypes() {
    return this.prisma.hr_employment_types.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    });
  }

  listPayGrades() {
    return this.prisma.hr_pay_grades.findMany({
      where: { is_active: true },
      orderBy: { level: "asc" },
    });
  }

  listLeaveTypes() {
    return this.prisma.hr_leave_types.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    });
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

  // ==== Teacher attendance management (ta_admin_hr_all / ac_admin_hr) =======
  private hrRole(actor: AuthUser): "admin" | "hr" {
    return actor.roles.includes("admin") ? "admin" : "hr";
  }
  private dateOnly(d: string) {
    // Normalise a YYYY-MM-DD string to a UTC midnight Date for @db.Date columns.
    return new Date(`${d.slice(0, 10)}T00:00:00.000Z`);
  }
  private dstr(d: Date | null | undefined): string | null {
    return d ? d.toISOString().slice(0, 10) : null;
  }
  private num(v: unknown): number {
    return v == null ? 0 : Number(v);
  }
  private shapeTa(a: {
    id: string;
    teacher_id: string;
    date: Date;
    status: string;
    check_in_time: Date | null;
    marked_by: string;
    correction_reason: string | null;
    notes: string | null;
  }) {
    return {
      id: a.id,
      teacher_id: a.teacher_id,
      date: this.dstr(a.date),
      status: a.status,
      check_in_time: a.check_in_time ? a.check_in_time.toISOString() : null,
      marked_by: a.marked_by,
      correction_reason: a.correction_reason,
      notes: a.notes,
    };
  }

  async attnTeachers(actor: AuthUser) {
    this.requireHr(actor);
    return this.prisma.teachers.findMany({
      where: { status: "active" },
      select: { id: true, full_name: true, email: true, subject: true, status: true },
      orderBy: { full_name: "asc" },
    });
  }

  async attnDay(actor: AuthUser, date: string) {
    this.requireHr(actor);
    const day = this.dateOnly(date);
    const next = new Date(day.getTime() + 86_400_000);
    const rows = await this.prisma.teacher_attendance.findMany({
      where: { date: { gte: day, lt: next } },
    });
    return rows.map((r) => this.shapeTa(r));
  }

  async attnMonth(actor: AuthUser, month: string) {
    this.requireHr(actor);
    const start = this.dateOnly(`${month.slice(0, 7)}-01`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const rows = await this.prisma.teacher_attendance.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: "desc" },
      include: { teachers: { select: { full_name: true } } },
    });
    return rows.map((r) => ({ ...this.shapeTa(r), teacher: r.teachers ?? null }));
  }

  async attnCorrections(actor: AuthUser) {
    this.requireHr(actor);
    const rows = await this.prisma.attendance_corrections.findMany({
      orderBy: { created_at: "desc" },
      take: 200,
      include: { teachers: { select: { full_name: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      date: this.dstr(c.date),
      from_status: c.from_status,
      to_status: c.to_status,
      changed_by_role: c.changed_by_role,
      reason: c.reason,
      created_at: c.created_at ? c.created_at.toISOString() : null,
      teacher: c.teachers ?? null,
    }));
  }

  async attnUpsert(
    actor: AuthUser,
    input: {
      teacherId: string;
      date: string;
      status: string;
      reason: string;
      checkIn?: string | null;
    },
  ) {
    this.requireHr(actor);
    if (!input.reason?.trim()) throw new BadRequestException("A reason is required.");
    const role = this.hrRole(actor);
    const day = this.dateOnly(input.date);
    const next = new Date(day.getTime() + 86_400_000);
    const checkIn = input.checkIn ? new Date(input.checkIn) : null;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.teacher_attendance.findFirst({
        where: { teacher_id: input.teacherId, date: { gte: day, lt: next } },
      });
      let attendanceId: string;
      if (existing) {
        const updated = await tx.teacher_attendance.update({
          where: { id: existing.id },
          data: {
            status: input.status,
            marked_by: role,
            marked_by_user: actor.id,
            correction_reason: input.reason,
            check_in_time: checkIn ?? existing.check_in_time,
          },
        });
        attendanceId = updated.id;
      } else {
        const created = await tx.teacher_attendance.create({
          data: {
            teacher_id: input.teacherId,
            date: day,
            status: input.status,
            marked_by: role,
            marked_by_user: actor.id,
            correction_reason: input.reason,
            check_in_time: checkIn,
          },
        });
        attendanceId = created.id;
      }
      await tx.attendance_corrections.create({
        data: {
          attendance_id: attendanceId,
          teacher_id: input.teacherId,
          date: day,
          from_status: existing?.status ?? null,
          to_status: input.status,
          from_check_in: existing?.check_in_time ?? null,
          to_check_in: checkIn ?? existing?.check_in_time ?? null,
          reason: input.reason,
          changed_by: actor.id,
          changed_by_role: role,
        },
      });
      return { id: attendanceId };
    });
  }

  // ==== Recruitment (job_read open / job_write + cand_hr = hr|admin) ========
  /** job_read is open to any authenticated user. */
  listOpenings() {
    return this.prisma.job_openings.findMany({ orderBy: { opened_at: "desc" } });
  }

  async createOpening(
    actor: AuthUser,
    input: {
      title: string;
      department?: string;
      positions?: number;
      status?: string;
      opened_at?: string;
      closes_at?: string;
      description?: string;
    },
  ) {
    this.requireHr(actor);
    const row = await this.prisma.job_openings.create({
      data: {
        title: input.title,
        department: input.department || null,
        positions: input.positions ?? 1,
        status: input.status || "open",
        opened_at: input.opened_at ? this.dateOnly(input.opened_at) : new Date(),
        closes_at: input.closes_at ? this.dateOnly(input.closes_at) : null,
        description: input.description || null,
      },
    });
    return { id: row.id };
  }

  async closeOpening(actor: AuthUser, id: string) {
    this.requireHr(actor);
    try {
      await this.prisma.job_openings.update({ where: { id }, data: { status: "closed" } });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
        throw new NotFoundException("Opening not found");
      throw e;
    }
  }

  async listCandidates(actor: AuthUser) {
    this.requireHr(actor);
    const rows = await this.prisma.candidates.findMany({
      orderBy: { created_at: "desc" },
      include: { job_openings: { select: { title: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      job_opening_id: c.job_opening_id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      stage: c.stage,
      source: c.source,
      rating: c.rating,
      job_opening: c.job_openings ? { title: c.job_openings.title } : null,
    }));
  }

  async createCandidate(
    actor: AuthUser,
    input: {
      job_opening_id: string;
      name: string;
      email?: string;
      phone?: string;
      source?: string;
      stage?: string;
      rating?: number;
    },
  ) {
    this.requireHr(actor);
    const row = await this.prisma.candidates.create({
      data: {
        job_opening_id: input.job_opening_id,
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        source: input.source || null,
        stage: input.stage || "applied",
        rating: input.rating ?? null,
      },
    });
    return { id: row.id };
  }

  async setCandidateStage(actor: AuthUser, id: string, stage: string) {
    this.requireHr(actor);
    try {
      await this.prisma.candidates.update({ where: { id }, data: { stage } });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
        throw new NotFoundException("Candidate not found");
      throw e;
    }
  }

  // ==== Shifts (shift_read open / shift_write + sshift_hr = hr|admin) =======
  private hhmm(d: Date | null | undefined): string | null {
    if (!d) return null;
    return d.toISOString().slice(11, 16); // HH:MM from the 1970 Time value
  }
  private parseTime(hhmm: string): Date {
    return new Date(`1970-01-01T${hhmm.slice(0, 5)}:00.000Z`);
  }

  async listShifts() {
    const rows = await this.prisma.shifts.findMany({ orderBy: { start_time: "asc" } });
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      shift_type: s.shift_type,
      start_time: this.hhmm(s.start_time),
      end_time: this.hhmm(s.end_time),
      weekly_off: s.weekly_off ?? [],
    }));
  }

  async createShift(
    actor: AuthUser,
    input: {
      name: string;
      start_time: string;
      end_time: string;
      shift_type?: string;
      weekly_off?: string[];
    },
  ) {
    this.requireHr(actor);
    try {
      const row = await this.prisma.shifts.create({
        data: {
          name: input.name,
          start_time: this.parseTime(input.start_time),
          end_time: this.parseTime(input.end_time),
          shift_type: input.shift_type || "regular",
          weekly_off: input.weekly_off ?? [],
        },
      });
      return { id: row.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("A shift with that name already exists.");
      throw e;
    }
  }

  async listStaffShifts(actor: AuthUser) {
    this.requireHr(actor);
    const rows = await this.prisma.staff_shifts.findMany({
      where: { effective_to: null },
      include: {
        staff: { select: { full_name: true, employee_code: true, department: true } },
        shifts: { select: { name: true } },
      },
    });
    return rows.map((a) => ({
      id: a.id,
      shift_id: a.shift_id,
      effective_from: this.dstr(a.effective_from),
      staff: a.staff ?? null,
      shift: a.shifts ? { name: a.shifts.name } : null,
    }));
  }

  // ==== Resignations & exit (res_hr = hr|admin) ============================
  async listResignations(actor: AuthUser) {
    this.requireHr(actor);
    const rows = await this.prisma.resignations.findMany({
      orderBy: { submitted_at: "desc" },
      include: {
        staff: {
          select: {
            full_name: true,
            employee_code: true,
            department: true,
            designation: true,
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      manager_status: r.manager_status,
      hr_status: r.hr_status,
      reason: r.reason,
      clearance: r.clearance ?? {},
      submitted_at: this.dstr(r.submitted_at),
      last_working_day: this.dstr(r.last_working_day),
      staff: r.staff ?? null,
    }));
  }

  async updateResignation(
    actor: AuthUser,
    id: string,
    input: {
      clearance?: Record<string, boolean>;
      manager_status?: string;
      hr_status?: string;
      status?: string;
    },
  ) {
    this.requireHr(actor);
    const data: Prisma.resignationsUpdateInput = {};
    if (input.clearance !== undefined) data.clearance = input.clearance;
    if (input.manager_status !== undefined) data.manager_status = input.manager_status;
    if (input.hr_status !== undefined) data.hr_status = input.hr_status;
    if (input.status !== undefined) data.status = input.status;
    if (Object.keys(data).length === 0) throw new BadRequestException("Nothing to update.");
    try {
      await this.prisma.resignations.update({ where: { id }, data });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
        throw new NotFoundException("Resignation not found");
      throw e;
    }
  }

  // ==== Travel requests (tv_hr = hr|admin) ================================
  async listTravel(actor: AuthUser) {
    this.requireHr(actor);
    const rows = await this.prisma.travel_requests.findMany({
      orderBy: { start_date: "desc" },
      include: { staff: { select: { full_name: true, employee_code: true } } },
    });
    return rows.map((t) => ({
      id: t.id,
      destination: t.destination,
      start_date: this.dstr(t.start_date),
      end_date: this.dstr(t.end_date),
      purpose: t.purpose,
      advance_amount: this.num(t.advance_amount),
      settlement_amount: t.settlement_amount == null ? null : this.num(t.settlement_amount),
      status: t.status,
      staff: t.staff ?? null,
    }));
  }

  async setTravelStatus(actor: AuthUser, id: string, status: string) {
    this.requireHr(actor);
    try {
      await this.prisma.travel_requests.update({ where: { id }, data: { status } });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
        throw new NotFoundException("Travel request not found");
      throw e;
    }
  }

  // ==== Overtime (ot_hr = hr|admin) =======================================
  async listOvertime(actor: AuthUser) {
    this.requireHr(actor);
    const rows = await this.prisma.overtime_requests.findMany({
      orderBy: { work_date: "desc" },
      include: {
        staff_overtime_requests_staff_idTostaff: {
          select: { full_name: true, employee_code: true },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      work_date: this.dstr(r.work_date),
      hours: this.num(r.hours),
      rate_multiplier: this.num(r.rate_multiplier),
      status: r.status,
      staff: r.staff_overtime_requests_staff_idTostaff ?? null,
    }));
  }

  async setOvertimeStatus(actor: AuthUser, id: string, status: string) {
    this.requireHr(actor);
    const approverStaffId = await this.ownStaffId(actor);
    try {
      await this.prisma.overtime_requests.update({
        where: { id },
        data: { status, approver_id: approverStaffId },
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025")
        throw new NotFoundException("Overtime request not found");
      throw e;
    }
  }

  // ==== HR analytics (hr|admin) — server-side aggregation ==================
  async analytics(actor: AuthUser) {
    this.requireHr(actor);
    const [staff, payroll, leave, cands] = await Promise.all([
      this.prisma.staff.findMany({ select: { department: true } }),
      this.prisma.payroll_runs.findMany({ select: { month: true, net_salary: true } }),
      this.prisma.leave_requests.findMany({ select: { leave_type: true } }),
      this.prisma.candidates.findMany({ select: { stage: true } }),
    ]);

    const deptCounts = staff.reduce<Record<string, number>>((a, s) => {
      const k = s.department ?? "—";
      a[k] = (a[k] ?? 0) + 1;
      return a;
    }, {});
    const monthTotals = payroll.reduce<Record<string, number>>((a, p) => {
      const k = this.dstr(p.month) ?? "";
      const key = k.slice(0, 7);
      if (key) a[key] = (a[key] ?? 0) + Number(p.net_salary ?? 0);
      return a;
    }, {});
    const leaveCounts = leave.reduce<Record<string, number>>((a, l) => {
      a[l.leave_type] = (a[l.leave_type] ?? 0) + 1;
      return a;
    }, {});

    return {
      byDept: Object.entries(deptCounts).map(([name, count]) => ({ name, count })),
      byMonth: Object.entries(monthTotals)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, total]) => ({ month, total })),
      leaveTypes: Object.entries(leaveCounts).map(([name, value]) => ({ name, value })),
      funnel: ["applied", "screening", "interview", "offer", "joined"].map((stage) => ({
        stage,
        count: cands.filter((c) => c.stage === stage).length,
      })),
    };
  }

  // ==== Document vault (hr_admin_sd = hr|admin) ============================
  async listDocuments(actor: AuthUser) {
    this.requireHr(actor);
    const rows = await this.prisma.staff_documents.findMany({
      orderBy: { uploaded_at: "desc" },
      include: {
        staff: { select: { full_name: true, employee_code: true, department: true } },
      },
    });
    return rows.map((d) => ({
      id: d.id,
      doc_type: d.doc_type,
      title: d.title,
      uploaded_at: d.uploaded_at ? d.uploaded_at.toISOString() : null,
      expiry_date: this.dstr(d.expiry_date),
      staff: d.staff ?? null,
    }));
  }

  // ==== Performance reviews (adm_hr_tpr = hr|admin) ========================
  async listPerformanceReviews(actor: AuthUser) {
    this.requireHr(actor);
    const rows = await this.prisma.teacher_performance_reviews.findMany({
      orderBy: { period: "desc" },
      include: { teachers: { select: { full_name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      period: r.period,
      rating: r.rating == null ? null : this.num(r.rating),
      notes: r.notes,
      teacher: r.teachers ?? null,
    }));
  }

  // ==== Training (tr_read open / tr_write + tra_hr = hr|admin) =============
  async listTrainingPrograms() {
    const rows = await this.prisma.training_programs.findMany({
      orderBy: { start_date: "desc" },
    });
    return rows.map((p) => ({
      id: p.id,
      title: p.title,
      program_type: p.program_type,
      provider: p.provider,
      start_date: this.dstr(p.start_date),
      end_date: this.dstr(p.end_date),
      cost: this.num(p.cost),
      skill_tags: p.skill_tags ?? [],
    }));
  }

  async listTrainingAttendance(actor: AuthUser) {
    this.requireHr(actor);
    const rows = await this.prisma.training_attendance.findMany({
      select: { program_id: true, staff_id: true, attended: true, rating: true },
    });
    return rows.map((a) => ({
      program_id: a.program_id,
      staff_id: a.staff_id,
      attended: a.attended,
      rating: a.rating == null ? null : this.num(a.rating),
    }));
  }

  async createTrainingProgram(
    actor: AuthUser,
    input: {
      title: string;
      program_type?: string;
      provider?: string;
      start_date?: string;
      end_date?: string;
      cost?: number;
      skill_tags?: string[];
    },
  ) {
    this.requireHr(actor);
    const row = await this.prisma.training_programs.create({
      data: {
        title: input.title,
        program_type: input.program_type || "workshop",
        provider: input.provider || null,
        start_date: input.start_date ? this.dateOnly(input.start_date) : null,
        end_date: input.end_date ? this.dateOnly(input.end_date) : null,
        cost: input.cost ?? 0,
        skill_tags: input.skill_tags ?? [],
      },
    });
    return { id: row.id };
  }

  // ==== Cross-module reports (hr|admin) — generic table export ============
  async report(actor: AuthUser, key: string) {
    this.requireHr(actor);
    const take = 500;
    switch (key) {
      case "employees":
        return this.prisma.staff.findMany({ take, orderBy: { employee_code: "asc" } });
      case "attendance":
        return this.prisma.teacher_attendance.findMany({ take, orderBy: { date: "desc" } });
      case "payroll":
        return this.prisma.payroll_runs.findMany({ take, orderBy: { created_at: "desc" } });
      case "leave":
        return this.prisma.leave_requests.findMany({ take, orderBy: { created_at: "desc" } });
      case "performance":
        return this.prisma.teacher_performance_reviews.findMany({
          take,
          orderBy: { period: "desc" },
        });
      case "recruitment":
        return this.prisma.candidates.findMany({ take, orderBy: { created_at: "desc" } });
      case "training":
        return this.prisma.training_programs.findMany({ take, orderBy: { start_date: "desc" } });
      case "resignation":
        return this.prisma.resignations.findMany({ take, orderBy: { submitted_at: "desc" } });
      case "expenses":
        return this.prisma.expense_claims.findMany({ take, orderBy: { created_at: "desc" } });
      default:
        throw new BadRequestException("Unknown report.");
    }
  }
}

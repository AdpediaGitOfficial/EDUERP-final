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
  code?: string;
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
export interface SalaryLineItem {
  label: string;
  amount: number;
}
export interface SalaryComponentsInput {
  basic?: number;
  earnings?: SalaryLineItem[];
  deductions?: SalaryLineItem[];
  pf_enabled?: boolean;
  esi_enabled?: boolean;
  pt_enabled?: boolean;
  tds_enabled?: boolean;
  tds_amount?: number;
}
export interface SalaryTemplateInput extends SalaryComponentsInput {
  name: string;
  code: string;
  description?: string | null;
}
export interface EmployeeSalaryInput extends SalaryComponentsInput {
  template_id?: string | null;
  effective_from?: string;
  notes?: string | null;
}
export interface LoanInput {
  staff_id: string;
  loan_type?: string;
  principal: number;
  interest_rate?: number;
  tenure_months: number;
  reason?: string | null;
}
export interface RepaymentInput {
  amount: number;
  paid_on?: string;
  installment_no?: number;
  notes?: string | null;
}
export interface CriterionInput {
  name: string;
  description?: string | null;
  weight?: number;
  max_score?: number;
}
export interface CycleInput {
  name: string;
  description?: string | null;
  period_start?: string | null;
  period_end?: string | null;
}
export interface RatingInput {
  criterion_id: string;
  score: number;
  comments?: string | null;
}
export interface SaveAppraisalInput {
  ratings?: RatingInput[];
  self_comments?: string | null;
  manager_comments?: string | null;
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

  // ── Payroll generation + management ──────────────────────────────────────
  private canReadPayroll(actor: AuthUser) {
    return this.isHr(actor) || actor.roles.includes("accountant");
  }
  private round2(n: number) {
    return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
  }

  /**
   * Generate (or refresh) payroll for a month. One run per active staff member
   * who has a salary structure. Gross = basic + earnings; statutory = PF (12% of
   * basic, ₹15k wage cap) / ESI (0.75% if gross ≤ ₹21k) / PT / TDS per the
   * structure's flags; attendance deduction = per-day gross × approved *unpaid*
   * leave days in the month (full month otherwise); other = structure deductions
   * + active-loan EMIs. Idempotent per (staff, month); already-*paid* runs are
   * left untouched.
   */
  async generatePayroll(actor: AuthUser, year: number, month: number) {
    this.requireHr(actor);
    if (!Number.isInteger(month) || month < 1 || month > 12)
      throw new BadRequestException("Month must be 1–12");
    if (!Number.isInteger(year) || year < 2000 || year > 2100)
      throw new BadRequestException("Invalid year");
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));
    const daysInMonth = monthEnd.getUTCDate();

    const [staff, structs, leaveTypes, leaves, loans] = await Promise.all([
      this.prisma.staff.findMany({ where: { status: "active" }, select: { id: true } }),
      this.prisma.hr_salary_structures.findMany({
        where: { effective_from: { lte: monthEnd } },
        orderBy: { effective_from: "desc" },
      }),
      this.prisma.hr_leave_types.findMany({ select: { name: true, code: true, is_paid: true } }),
      this.prisma.leave_requests.findMany({
        where: { status: "approved", start_date: { lte: monthEnd }, end_date: { gte: monthStart } },
      }),
      this.prisma.hr_loans.findMany({ where: { status: "active" } }),
    ]);

    const structByStaff = new Map<string, (typeof structs)[number]>();
    for (const s of structs) if (!structByStaff.has(s.staff_id)) structByStaff.set(s.staff_id, s);

    const unpaidNames = new Set(
      leaveTypes
        .filter((t) => t.is_paid === false)
        .flatMap((t) => [t.name?.toLowerCase(), t.code?.toLowerCase()])
        .filter(Boolean) as string[],
    );
    const unpaidDaysByStaff = new Map<string, number>();
    for (const lv of leaves) {
      if (!unpaidNames.has((lv.leave_type ?? "").toLowerCase())) continue;
      const s = Math.max(lv.start_date.getTime(), monthStart.getTime());
      const e = Math.min(lv.end_date.getTime(), monthEnd.getTime());
      const days = Math.floor((e - s) / 86_400_000) + 1;
      if (days > 0)
        unpaidDaysByStaff.set(lv.staff_id, (unpaidDaysByStaff.get(lv.staff_id) ?? 0) + days);
    }

    const emiByStaff = new Map<string, number>();
    for (const ln of loans) {
      const emi = Number(ln.principal) / Math.max(1, ln.tenure_months);
      emiByStaff.set(ln.staff_id, (emiByStaff.get(ln.staff_id) ?? 0) + emi);
    }
    const sumJson = (v: unknown) =>
      Array.isArray(v) ? v.reduce((a, x: any) => a + Number(x?.amount || 0), 0) : 0;

    let generated = 0;
    let skippedPaid = 0;
    let noStructure = 0;
    for (const st of staff) {
      const struct = structByStaff.get(st.id);
      if (!struct) {
        noStructure++;
        continue;
      }
      const existing = await this.prisma.payroll_runs.findUnique({
        where: { staff_id_month: { staff_id: st.id, month: monthStart } },
      });
      if (existing?.status === "paid") {
        skippedPaid++;
        continue;
      }
      const basic = Number(struct.basic) || 0;
      const earnings = sumJson(struct.earnings);
      const gross = basic + earnings;
      const pf = struct.pf_enabled ? Math.min(basic, 15000) * 0.12 : 0;
      const esi = struct.esi_enabled && gross <= 21000 ? gross * 0.0075 : 0;
      const pt = struct.pt_enabled ? (gross > 15000 ? 200 : 0) : 0;
      const tds = struct.tds_enabled ? Number(struct.tds_amount || 0) : 0;
      const statutory = pf + esi + pt + tds;
      const other = sumJson(struct.deductions) + (emiByStaff.get(st.id) ?? 0);
      const unpaidDays = Math.min(unpaidDaysByStaff.get(st.id) ?? 0, daysInMonth);
      const daysWorked = daysInMonth - unpaidDays;
      const attendance = gross > 0 ? (gross / daysInMonth) * unpaidDays : 0;
      const deductions = attendance + statutory + other;
      const net = Math.max(0, gross - deductions);
      const data = {
        base_salary: this.round2(basic),
        allowances: this.round2(earnings),
        gross_salary: this.round2(gross),
        working_days: daysInMonth,
        days_worked: this.round2(daysWorked),
        attendance_deduction: this.round2(attendance),
        statutory_deductions: this.round2(statutory),
        other_deductions: this.round2(other),
        deductions: this.round2(deductions),
        net_salary: this.round2(net),
      };
      await this.prisma.payroll_runs.upsert({
        where: { staff_id_month: { staff_id: st.id, month: monthStart } },
        create: { staff_id: st.id, month: monthStart, status: "pending", ...data },
        update: { ...data, updated_at: new Date() },
      });
      generated++;
    }
    return { month: monthStart, daysInMonth, generated, skippedPaid, noStructure };
  }

  /** Payroll runs grouped by month, for the "Generated Payroll List". */
  async payrollMonths(actor: AuthUser) {
    if (!this.canReadPayroll(actor)) throw new ForbiddenException();
    const runs = await this.prisma.payroll_runs.findMany({
      select: { month: true, status: true, net_salary: true, created_at: true, pay_date: true },
    });
    const byMonth = new Map<string, any>();
    for (const r of runs) {
      const key = r.month.toISOString().slice(0, 10);
      const g = byMonth.get(key) ?? {
        month: r.month,
        employees: 0,
        totalNet: 0,
        paid: 0,
        pending: 0,
        generatedOn: r.created_at,
      };
      g.employees++;
      g.totalNet += Number(r.net_salary || 0);
      if (r.status === "paid") g.paid++;
      else g.pending++;
      if (r.created_at > g.generatedOn) g.generatedOn = r.created_at;
      byMonth.set(key, g);
    }
    return Array.from(byMonth.values())
      .map((g) => ({ ...g, totalNet: this.round2(g.totalNet), status: g.pending === 0 ? "paid" : "generated" }))
      .sort((a, b) => b.month.getTime() - a.month.getTime());
  }

  /** Per-employee breakdown for one payroll month. */
  async payrollDetail(actor: AuthUser, year: number, month: number) {
    if (!this.canReadPayroll(actor)) throw new ForbiddenException();
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const rows = await this.prisma.payroll_runs.findMany({
      where: { month: monthStart },
      include: { staff: { select: { full_name: true, employee_code: true, designation: true } } },
      orderBy: { staff: { full_name: "asc" } },
    });
    return {
      month: monthStart,
      rows: rows.map((p) => ({
        id: p.id,
        staffName: p.staff?.full_name ?? null,
        employeeCode: p.staff?.employee_code ?? null,
        designation: p.staff?.designation ?? null,
        grossSalary: p.gross_salary,
        workingDays: p.working_days,
        daysWorked: p.days_worked,
        attendanceDeduction: p.attendance_deduction,
        statutoryDeductions: p.statutory_deductions,
        otherDeductions: p.other_deductions,
        netSalary: p.net_salary,
        status: p.status,
        payDate: p.pay_date,
      })),
    };
  }

  /** Mark a single payroll run as paid (stamps the pay date). */
  async payPayrollRun(actor: AuthUser, id: string) {
    this.requireHr(actor);
    const run = await this.prisma.payroll_runs.findUnique({ where: { id } });
    if (!run) throw new NotFoundException("Payroll run not found");
    if (run.status === "paid") return { ok: true, alreadyPaid: true };
    await this.prisma.payroll_runs.update({
      where: { id },
      data: { status: "paid", pay_date: new Date(), updated_at: new Date() },
    });
    return { ok: true };
  }

  /** Edit an unpaid run's deduction/allowance amounts; net is recomputed. */
  async updatePayrollRun(
    actor: AuthUser,
    id: string,
    input: {
      allowances?: number;
      attendance_deduction?: number;
      statutory_deductions?: number;
      other_deductions?: number;
      notes?: string;
    },
  ) {
    this.requireHr(actor);
    const run = await this.prisma.payroll_runs.findUnique({ where: { id } });
    if (!run) throw new NotFoundException("Payroll run not found");
    if (run.status === "paid")
      throw new BadRequestException("A paid payroll run can't be edited.");
    const allowances = input.allowances ?? Number(run.allowances);
    const gross = Number(run.base_salary) + allowances;
    const attendance = input.attendance_deduction ?? Number(run.attendance_deduction);
    const statutory = input.statutory_deductions ?? Number(run.statutory_deductions);
    const other = input.other_deductions ?? Number(run.other_deductions);
    const deductions = attendance + statutory + other;
    await this.prisma.payroll_runs.update({
      where: { id },
      data: {
        allowances: this.round2(allowances),
        gross_salary: this.round2(gross),
        attendance_deduction: this.round2(attendance),
        statutory_deductions: this.round2(statutory),
        other_deductions: this.round2(other),
        deductions: this.round2(deductions),
        net_salary: this.round2(Math.max(0, gross - deductions)),
        notes: input.notes ?? run.notes,
        updated_at: new Date(),
      },
    });
    return { ok: true };
  }

  /** Data for a single payslip PDF (scoped like listing). */
  async payslipData(actor: AuthUser, id: string) {
    const run = await this.prisma.payroll_runs.findUnique({
      where: { id },
      include: { staff: { select: { full_name: true, employee_code: true, designation: true, department: true, profile_id: true } } },
    });
    if (!run) throw new NotFoundException("Payroll run not found");
    if (!this.canReadPayroll(actor) && run.staff?.profile_id !== actor.id)
      throw new ForbiddenException();
    return run;
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

  // ── Compensation: salary templates + per-employee "Set Salary" ──────────────
  //
  // Statutory rates mirror the demo defaults on the HR Settings page. They are
  // computed here so PF/ESI/PT are never entered (or double-counted) by hand.
  private static readonly PF_RATE = 0.12; // employee PF on basic
  private static readonly ESI_RATE = 0.0075; // ESI on gross
  private static readonly ESI_WAGE_CEILING = 21000; // ESI only applies at/under this gross
  private static readonly PT_FLAT = 200; // monthly professional tax

  /** Read-side gate: hr|admin write everything, accountant may read compensation. */
  private canReadPay(actor: AuthUser) {
    return this.isHr(actor) || actor.roles.includes("accountant");
  }

  private lineItems(raw: unknown): { label: string; amount: number }[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => ({
        label: String((x as any)?.label ?? "").trim(),
        amount: Number((x as any)?.amount ?? 0),
      }))
      .filter((x) => x.label && Number.isFinite(x.amount));
  }

  /** Derive the full statutory + net breakdown for a template or structure row. */
  private computeBreakdown(row: {
    basic: unknown;
    earnings: unknown;
    deductions: unknown;
    pf_enabled: boolean;
    esi_enabled: boolean;
    pt_enabled: boolean;
    tds_enabled: boolean;
    tds_amount: unknown;
  }) {
    const basic = Math.max(0, Number(row.basic ?? 0));
    const earnings = this.lineItems(row.earnings);
    const deductions = this.lineItems(row.deductions);
    const round = (n: number) => Math.round(n * 100) / 100;

    const gross = round(basic + earnings.reduce((s, e) => s + e.amount, 0));
    const pf = row.pf_enabled ? round(basic * HrService.PF_RATE) : 0;
    const esi =
      row.esi_enabled && gross <= HrService.ESI_WAGE_CEILING
        ? round(gross * HrService.ESI_RATE)
        : 0;
    const pt = row.pt_enabled ? HrService.PT_FLAT : 0;
    const tds = row.tds_enabled ? Math.max(0, Number(row.tds_amount ?? 0)) : 0;
    const otherDeductions = round(deductions.reduce((s, d) => s + d.amount, 0));
    const totalDeductions = round(pf + esi + pt + tds + otherDeductions);
    const net = round(gross - totalDeductions);

    return {
      basic,
      earnings,
      deductions,
      gross,
      statutory: { pf, esi, pt, tds },
      otherDeductions,
      totalDeductions,
      net,
      annualCtc: round(gross * 12),
    };
  }

  private mapSalaryInput(input: SalaryComponentsInput) {
    return {
      basic: input.basic ?? 0,
      earnings: this.lineItems(input.earnings) as unknown as Prisma.InputJsonValue,
      deductions: this.lineItems(input.deductions) as unknown as Prisma.InputJsonValue,
      pf_enabled: input.pf_enabled ?? true,
      esi_enabled: input.esi_enabled ?? true,
      pt_enabled: input.pt_enabled ?? true,
      tds_enabled: input.tds_enabled ?? false,
      tds_amount: input.tds_amount ?? 0,
    };
  }

  async listSalaryTemplates(actor: AuthUser) {
    if (!this.canReadPay(actor)) throw new ForbiddenException();
    const rows = await this.prisma.hr_salary_templates.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    });
    return rows.map((t) => ({ ...t, breakdown: this.computeBreakdown(t) }));
  }

  async createSalaryTemplate(actor: AuthUser, input: SalaryTemplateInput) {
    this.requireHr(actor);
    try {
      const row = await this.prisma.hr_salary_templates.create({
        data: { name: input.name, code: input.code, description: input.description || null, ...this.mapSalaryInput(input) },
      });
      return { id: row.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("That template code is already in use.");
      throw e;
    }
  }

  async updateSalaryTemplate(actor: AuthUser, id: string, input: SalaryTemplateInput) {
    this.requireHr(actor);
    const existing = await this.prisma.hr_salary_templates.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Template not found");
    try {
      await this.prisma.hr_salary_templates.update({
        where: { id },
        data: {
          name: input.name,
          code: input.code,
          description: input.description || null,
          updated_at: new Date(),
          ...this.mapSalaryInput(input),
        },
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("That template code is already in use.");
      throw e;
    }
  }

  async deleteSalaryTemplate(actor: AuthUser, id: string) {
    this.requireHr(actor);
    const existing = await this.prisma.hr_salary_templates.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Template not found");
    // Soft-deactivate: structures reference it (ON DELETE SET NULL keeps them safe,
    // but keeping the row lets existing assignments still name their source).
    await this.prisma.hr_salary_templates.update({
      where: { id },
      data: { is_active: false, updated_at: new Date() },
    });
    return { ok: true };
  }

  /** Current salary structure for one employee, with the computed breakdown. */
  async getEmployeeSalary(actor: AuthUser, staffId: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException("Employee not found");
    if (!this.canReadPay(actor) && staff.profile_id !== actor.id) throw new ForbiddenException();
    const structure = await this.prisma.hr_salary_structures.findUnique({
      where: { staff_id: staffId },
      include: { template: { select: { name: true, code: true } } },
    });
    if (!structure) return { structure: null, breakdown: null };
    return { structure, breakdown: this.computeBreakdown(structure) };
  }

  /** Set (create or replace) an employee's salary structure. hr|admin only. */
  async setEmployeeSalary(actor: AuthUser, staffId: string, input: EmployeeSalaryInput) {
    this.requireHr(actor);
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException("Employee not found");
    if (input.template_id) {
      const tpl = await this.prisma.hr_salary_templates.findUnique({
        where: { id: input.template_id },
      });
      if (!tpl) throw new BadRequestException("Unknown salary template");
    }
    const data = {
      template_id: input.template_id || null,
      effective_from: input.effective_from ? new Date(input.effective_from) : new Date(),
      notes: input.notes || null,
      ...this.mapSalaryInput(input),
    };
    const existing = await this.prisma.hr_salary_structures.findUnique({
      where: { staff_id: staffId },
    });
    await this.prisma.$transaction([
      this.prisma.hr_salary_structures.upsert({
        where: { staff_id: staffId },
        create: { staff_id: staffId, ...data },
        update: { ...data, updated_at: new Date() },
      }),
      this.prisma.staff_employment_history.create({
        data: {
          staff_id: staffId,
          event_type: existing ? "salary_revised" : "salary_assigned",
          effective_date: data.effective_from,
          notes: "Salary structure " + (existing ? "revised" : "assigned"),
        },
      }),
    ]);
    return { ok: true };
  }

  // ── Loans & advances: request → approve → disburse → repay ──────────────────
  private static readonly LOAN_STATUSES = ["pending", "approved", "active", "closed", "rejected"];

  /** Level monthly instalment. Interest-free → principal/tenure; else reducing-balance EMI. */
  private computeEmi(principal: number, annualRatePct: number, tenure: number) {
    const n = Math.max(1, Math.round(tenure));
    if (!annualRatePct || annualRatePct <= 0) return Math.round((principal / n) * 100) / 100;
    const r = annualRatePct / 100 / 12;
    const emi = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    return Math.round(emi * 100) / 100;
  }

  private loanView(loan: {
    principal: unknown;
    interest_rate: unknown;
    tenure_months: number;
    repayments?: { amount: unknown }[];
  }) {
    const principal = Number(loan.principal ?? 0);
    const rate = Number(loan.interest_rate ?? 0);
    const repaid =
      loan.repayments?.reduce((s, r) => s + Number(r.amount ?? 0), 0) ?? 0;
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      emi: this.computeEmi(principal, rate, loan.tenure_months),
      totalRepaid: round(repaid),
      outstanding: round(Math.max(0, principal - repaid)),
    };
  }

  async listLoans(actor: AuthUser, staffId?: string) {
    // hr|admin|accountant see everything; a staff member sees only their own.
    let where: Prisma.hr_loansWhereInput = {};
    if (this.canReadPay(actor)) {
      where = staffId ? { staff_id: staffId } : {};
    } else {
      const me = await this.prisma.staff.findFirst({ where: { profile_id: actor.id } });
      if (!me) throw new ForbiddenException();
      where = { staff_id: me.id };
    }
    const rows = await this.prisma.hr_loans.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: {
        repayments: { select: { amount: true } },
        staff: { select: { full_name: true, employee_code: true } },
      },
    });
    return rows.map((l) => ({ ...l, ...this.loanView(l) }));
  }

  async getLoan(actor: AuthUser, id: string) {
    const loan = await this.prisma.hr_loans.findUnique({
      where: { id },
      include: {
        repayments: { orderBy: { paid_on: "asc" } },
        staff: { select: { id: true, full_name: true, employee_code: true, profile_id: true } },
        approver: { select: { full_name: true } },
      },
    });
    if (!loan) throw new NotFoundException("Loan not found");
    if (!this.canReadPay(actor) && loan.staff.profile_id !== actor.id)
      throw new ForbiddenException();
    return { ...loan, ...this.loanView(loan) };
  }

  async createLoan(actor: AuthUser, input: LoanInput) {
    this.requireHr(actor);
    if (!(input.principal > 0)) throw new BadRequestException("Principal must be greater than zero");
    if (!(input.tenure_months > 0)) throw new BadRequestException("Tenure must be at least 1 month");
    const staff = await this.prisma.staff.findUnique({ where: { id: input.staff_id } });
    if (!staff) throw new NotFoundException("Employee not found");
    const row = await this.prisma.hr_loans.create({
      data: {
        staff_id: input.staff_id,
        loan_type: input.loan_type || "advance",
        principal: input.principal,
        interest_rate: input.interest_rate ?? 0,
        tenure_months: input.tenure_months,
        reason: input.reason || null,
        status: "pending",
      },
    });
    return { id: row.id };
  }

  /** Approve (→ active, stamps disbursed_on + approver) or reject a pending loan. */
  async decideLoan(actor: AuthUser, id: string, decision: "approved" | "rejected") {
    this.requireHr(actor);
    const loan = await this.prisma.hr_loans.findUnique({ where: { id } });
    if (!loan) throw new NotFoundException("Loan not found");
    if (loan.status !== "pending")
      throw new BadRequestException("Only a pending loan can be approved or rejected");
    const approver = await this.prisma.staff.findFirst({ where: { profile_id: actor.id } });
    await this.prisma.hr_loans.update({
      where: { id },
      data:
        decision === "approved"
          ? {
              status: "active",
              disbursed_on: new Date(),
              approved_by: approver?.id ?? null,
              updated_at: new Date(),
            }
          : { status: "rejected", updated_at: new Date() },
    });
    return { ok: true };
  }

  /** Record a repayment; auto-closes the loan once the outstanding balance hits zero. */
  async recordRepayment(actor: AuthUser, loanId: string, input: RepaymentInput) {
    this.requireHr(actor);
    if (!(input.amount > 0)) throw new BadRequestException("Repayment amount must be positive");
    const loan = await this.prisma.hr_loans.findUnique({
      where: { id: loanId },
      include: { repayments: { select: { amount: true } } },
    });
    if (!loan) throw new NotFoundException("Loan not found");
    if (loan.status !== "active")
      throw new BadRequestException("Repayments can only be recorded against an active loan");
    const { outstanding } = this.loanView(loan);
    if (input.amount > outstanding + 0.01)
      throw new BadRequestException(
        `Repayment exceeds the outstanding balance of ${outstanding.toFixed(2)}`,
      );
    const willClose = input.amount >= outstanding - 0.01;
    await this.prisma.$transaction([
      this.prisma.hr_loan_repayments.create({
        data: {
          loan_id: loanId,
          amount: input.amount,
          paid_on: input.paid_on ? new Date(input.paid_on) : new Date(),
          installment_no: input.installment_no ?? (loan.repayments.length + 1),
          notes: input.notes || null,
        },
      }),
      this.prisma.hr_loans.update({
        where: { id: loanId },
        data: { updated_at: new Date(), ...(willClose ? { status: "closed" } : {}) },
      }),
    ]);
    return { ok: true, closed: willClose };
  }

  // ── Performance appraisals: criteria masters, cycles, scored reviews ─────────

  listCriteria(actor: AuthUser) {
    this.requireHr(actor);
    return this.prisma.hr_appraisal_criteria.findMany({
      where: { is_active: true },
      orderBy: { created_at: "asc" },
    });
  }

  async createCriterion(actor: AuthUser, input: CriterionInput) {
    this.requireHr(actor);
    const row = await this.prisma.hr_appraisal_criteria.create({
      data: {
        name: input.name,
        description: input.description || null,
        weight: input.weight ?? 1,
        max_score: input.max_score ?? 5,
      },
    });
    return { id: row.id };
  }

  async updateCriterion(actor: AuthUser, id: string, input: CriterionInput) {
    this.requireHr(actor);
    const existing = await this.prisma.hr_appraisal_criteria.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Criterion not found");
    await this.prisma.hr_appraisal_criteria.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description || null,
        weight: input.weight ?? Number(existing.weight),
        max_score: input.max_score ?? existing.max_score,
      },
    });
    return { ok: true };
  }

  async deleteCriterion(actor: AuthUser, id: string) {
    this.requireHr(actor);
    const existing = await this.prisma.hr_appraisal_criteria.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Criterion not found");
    await this.prisma.hr_appraisal_criteria.update({ where: { id }, data: { is_active: false } });
    return { ok: true };
  }

  async listCycles(actor: AuthUser) {
    this.requireHr(actor);
    const cycles = await this.prisma.hr_appraisal_cycles.findMany({
      orderBy: { created_at: "desc" },
      include: { _count: { select: { appraisals: true } } },
    });
    return cycles.map((c) => ({ ...c, appraisalCount: c._count.appraisals }));
  }

  async createCycle(actor: AuthUser, input: CycleInput) {
    this.requireHr(actor);
    const row = await this.prisma.hr_appraisal_cycles.create({
      data: {
        name: input.name,
        description: input.description || null,
        period_start: input.period_start ? new Date(input.period_start) : null,
        period_end: input.period_end ? new Date(input.period_end) : null,
      },
    });
    return { id: row.id };
  }

  async setCycleStatus(actor: AuthUser, id: string, status: string) {
    this.requireHr(actor);
    if (!["draft", "active", "closed"].includes(status))
      throw new BadRequestException("Invalid cycle status");
    const existing = await this.prisma.hr_appraisal_cycles.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Cycle not found");
    await this.prisma.hr_appraisal_cycles.update({
      where: { id },
      data: { status, updated_at: new Date() },
    });
    return { ok: true };
  }

  /** Weighted, max-score-normalised overall out of 100 for a set of ratings. */
  private scoreAppraisal(
    criteria: { id: string; weight: unknown; max_score: number }[],
    ratings: { criterion_id: string; score: unknown }[],
  ) {
    const byCriterion = new Map(ratings.map((r) => [r.criterion_id, Number(r.score)]));
    let weighted = 0;
    let totalWeight = 0;
    let rated = 0;
    for (const c of criteria) {
      const w = Number(c.weight) || 0;
      totalWeight += w;
      if (byCriterion.has(c.id)) {
        rated++;
        const s = Math.min(Number(byCriterion.get(c.id)) || 0, c.max_score);
        weighted += (s / (c.max_score || 1)) * w;
      }
    }
    const overall = totalWeight > 0 ? Math.round((weighted / totalWeight) * 100 * 100) / 100 : 0;
    return { overall, rated, total: criteria.length };
  }

  async listAppraisals(actor: AuthUser, cycleId?: string) {
    this.requireHr(actor);
    const rows = await this.prisma.hr_appraisals.findMany({
      where: cycleId ? { cycle_id: cycleId } : {},
      orderBy: { created_at: "desc" },
      include: {
        staff: { select: { full_name: true, employee_code: true, department: true } },
        cycle: { select: { name: true, status: true } },
      },
    });
    return rows;
  }

  async enrollAppraisal(actor: AuthUser, cycleId: string, staffId: string) {
    this.requireHr(actor);
    const [cycle, staff] = await Promise.all([
      this.prisma.hr_appraisal_cycles.findUnique({ where: { id: cycleId } }),
      this.prisma.staff.findUnique({ where: { id: staffId } }),
    ]);
    if (!cycle) throw new NotFoundException("Cycle not found");
    if (!staff) throw new NotFoundException("Employee not found");
    try {
      const row = await this.prisma.hr_appraisals.create({
        data: { cycle_id: cycleId, staff_id: staffId },
      });
      return { id: row.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        throw new ConflictException("This employee is already enrolled in the cycle.");
      throw e;
    }
  }

  async getAppraisal(actor: AuthUser, id: string) {
    const appraisal = await this.prisma.hr_appraisals.findUnique({
      where: { id },
      include: {
        staff: { select: { id: true, full_name: true, employee_code: true, profile_id: true } },
        cycle: { select: { id: true, name: true, status: true, period_start: true, period_end: true } },
        ratings: true,
      },
    });
    if (!appraisal) throw new NotFoundException("Appraisal not found");
    if (!this.isHr(actor) && appraisal.staff.profile_id !== actor.id) throw new ForbiddenException();
    const criteria = await this.prisma.hr_appraisal_criteria.findMany({
      where: { is_active: true },
      orderBy: { created_at: "asc" },
    });
    const ratingByCriterion = new Map(appraisal.ratings.map((r) => [r.criterion_id, r]));
    const scored = criteria.map((c) => {
      const r = ratingByCriterion.get(c.id);
      return {
        criterion_id: c.id,
        name: c.name,
        description: c.description,
        weight: c.weight,
        max_score: c.max_score,
        score: r ? Number(r.score) : null,
        comments: r?.comments ?? null,
      };
    });
    const { overall, rated, total } = this.scoreAppraisal(criteria, appraisal.ratings);
    return { ...appraisal, criteria: scored, overall, ratedCount: rated, criteriaCount: total };
  }

  async saveAppraisal(actor: AuthUser, id: string, input: SaveAppraisalInput) {
    this.requireHr(actor);
    const appraisal = await this.prisma.hr_appraisals.findUnique({ where: { id } });
    if (!appraisal) throw new NotFoundException("Appraisal not found");
    if (appraisal.status === "completed")
      throw new BadRequestException("A completed appraisal can no longer be edited");
    const criteria = await this.prisma.hr_appraisal_criteria.findMany({
      where: { is_active: true },
    });
    const validIds = new Set(criteria.map((c) => c.id));
    const maxById = new Map(criteria.map((c) => [c.id, c.max_score]));
    const ratings = (input.ratings ?? []).filter((r) => validIds.has(r.criterion_id));
    for (const r of ratings) {
      const max = maxById.get(r.criterion_id) ?? 5;
      if (r.score < 0 || r.score > max)
        throw new BadRequestException(`Score for a criterion must be between 0 and ${max}`);
    }
    const reviewer = await this.prisma.staff.findFirst({ where: { profile_id: actor.id } });
    const { overall } = this.scoreAppraisal(
      criteria,
      // merge existing + incoming so the score reflects a partial save too
      [
        ...(await this.prisma.hr_appraisal_ratings.findMany({ where: { appraisal_id: id } })).filter(
          (er) => !ratings.some((nr) => nr.criterion_id === er.criterion_id),
        ),
        ...ratings.map((r) => ({ criterion_id: r.criterion_id, score: r.score })),
      ],
    );
    await this.prisma.$transaction([
      ...ratings.map((r) =>
        this.prisma.hr_appraisal_ratings.upsert({
          where: { appraisal_id_criterion_id: { appraisal_id: id, criterion_id: r.criterion_id } },
          create: {
            appraisal_id: id,
            criterion_id: r.criterion_id,
            score: r.score,
            comments: r.comments || null,
          },
          update: { score: r.score, comments: r.comments || null },
        }),
      ),
      this.prisma.hr_appraisals.update({
        where: { id },
        data: {
          overall_score: overall,
          status: appraisal.status === "pending" ? "in_review" : appraisal.status,
          reviewer_id: appraisal.reviewer_id ?? reviewer?.id ?? null,
          ...(input.self_comments !== undefined ? { self_comments: input.self_comments || null } : {}),
          ...(input.manager_comments !== undefined
            ? { manager_comments: input.manager_comments || null }
            : {}),
          updated_at: new Date(),
        },
      }),
    ]);
    return { ok: true, overall };
  }

  async completeAppraisal(actor: AuthUser, id: string) {
    this.requireHr(actor);
    const appraisal = await this.prisma.hr_appraisals.findUnique({
      where: { id },
      include: { ratings: true },
    });
    if (!appraisal) throw new NotFoundException("Appraisal not found");
    const criteria = await this.prisma.hr_appraisal_criteria.findMany({
      where: { is_active: true },
    });
    const ratedIds = new Set(appraisal.ratings.map((r) => r.criterion_id));
    const missing = criteria.filter((c) => !ratedIds.has(c.id));
    if (missing.length > 0)
      throw new BadRequestException(
        `Every criterion must be rated before completing (${missing.length} remaining).`,
      );
    const { overall } = this.scoreAppraisal(criteria, appraisal.ratings);
    await this.prisma.hr_appraisals.update({
      where: { id },
      data: { status: "completed", overall_score: overall, updated_at: new Date() },
    });
    return { ok: true, overall };
  }

  async createDepartment(actor: AuthUser, input: DepartmentInput) {
    this.requireHr(actor);
    // The code is system-assigned: a 2-letter prefix from the name + a running
    // 3-digit sequence (e.g. "Accounts" → AC001). A hand-supplied code is still
    // honoured, so existing integrations keep working.
    const code = input.code?.trim() || (await this.nextDepartmentCode(input.name));
    try {
      const row = await this.prisma.departments.create({
        data: {
          name: input.name,
          code,
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

  /** Next unused department code for the name's prefix (AC001, AC002, …). */
  private async nextDepartmentCode(name: string): Promise<string> {
    const prefix = (name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "DP");
    const rows = await this.prisma.departments.findMany({
      where: { code: { startsWith: prefix } },
      select: { code: true },
    });
    let max = 0;
    for (const r of rows) {
      const m = r.code.slice(prefix.length).match(/^(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
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

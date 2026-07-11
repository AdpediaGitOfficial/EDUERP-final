import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   expenses: acc_admin_exp -> accountant|admin ALL. No other role has any access.
 * The ledger view combines payments (in) and expenses (out) — both sides
 * accountant|admin per pay_admin_all/acc_admin_exp (payments also has an
 * accountant read via the Finance UI; scoped here to accountant|admin).
 */
@Injectable()
export class FinanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private assertFinance(actor: AuthUser) {
    if (!actor.roles.some((r) => r === "admin" || r === "accountant")) {
      throw new ForbiddenException();
    }
  }

  /**
   * Finance dashboard aggregation — ports the ~8 client-side queries in
   * finance.index.tsx into one accountant|admin endpoint. `from`/`to` bound the
   * period-sensitive KPIs (revenue/refunds/payroll/expenses); the trend,
   * efficiency, fee-by-class and overdue panels are period-independent.
   */
  async dashboard(actor: AuthUser, from?: string, to?: string) {
    this.assertFinance(actor);
    const fromD = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toD = to ? new Date(to) : new Date();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const [payments, fees, expenses, payroll, feeByClass] = await Promise.all([
      this.prisma.payments.findMany({ select: { amount: true, status: true, paid_at: true } }),
      this.prisma.fee_assignments.findMany({
        select: { amount_due: true, amount_paid: true },
      }),
      this.prisma.expenses.findMany({ select: { amount: true, expense_date: true } }),
      this.prisma.payroll_runs.findMany({
        select: { net_salary: true, status: true, month: true },
      }),
      this.prisma.fee_assignments.findMany({
        select: {
          amount_due: true,
          amount_paid: true,
          students: {
            select: { classes: { select: { id: true, name: true, section: true } } },
          },
        },
      }),
    ]);

    const inRange = (d: Date | null) =>
      !!d && d.getTime() >= fromD.getTime() && d.getTime() <= toD.getTime();
    const num = (v: unknown) => Number(v ?? 0);

    const revenue = payments
      .filter((p) => p.status === "successful" && inRange(p.paid_at))
      .reduce((a, p) => a + num(p.amount), 0);
    const outstanding = fees.reduce(
      (a, f) => a + Math.max(0, num(f.amount_due) - num(f.amount_paid)),
      0,
    );
    const todaysCollections = payments
      .filter(
        (p) =>
          p.status === "successful" && (p.paid_at?.toISOString().slice(0, 10) ?? "") === todayStr,
      )
      .reduce((a, p) => a + num(p.amount), 0);
    const refunds = payments
      .filter((p) => p.status === "refunded" && inRange(p.paid_at))
      .reduce((a, p) => a + num(p.amount), 0);
    const payrollPeriod = payroll
      .filter((p) => p.status === "paid" && inRange(p.month))
      .reduce((a, p) => a + num(p.net_salary), 0);
    const expensePeriod = expenses
      .filter((e) => inRange(e.expense_date))
      .reduce((a, e) => a + num(e.amount), 0);

    // 6-month revenue trend (period-independent).
    const trend: { key: string; label: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      trend.push({
        key: d.toISOString().slice(0, 7),
        label: d.toLocaleString("en-IN", { month: "short" }),
        revenue: 0,
      });
    }
    for (const p of payments) {
      if (p.status !== "successful" || !p.paid_at) continue;
      const b = trend.find((x) => x.key === p.paid_at!.toISOString().slice(0, 7));
      if (b) b.revenue += num(p.amount);
    }

    // Collection efficiency: this term vs last term (Jan–Jun / Jul–Dec).
    const m = now.getMonth();
    const thisTerm = {
      from: m < 6 ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), 6, 1),
      to:
        m < 6
          ? new Date(now.getFullYear(), 5, 30, 23, 59, 59)
          : new Date(now.getFullYear(), 11, 31, 23, 59, 59),
    };
    const lastTerm =
      m < 6
        ? {
            from: new Date(now.getFullYear() - 1, 6, 1),
            to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59),
          }
        : {
            from: new Date(now.getFullYear(), 0, 1),
            to: new Date(now.getFullYear(), 5, 30, 23, 59, 59),
          };
    const collected = (r: { from: Date; to: Date }) =>
      payments
        .filter(
          (p) => p.status === "successful" && p.paid_at && p.paid_at >= r.from && p.paid_at <= r.to,
        )
        .reduce((a, p) => a + num(p.amount), 0);
    const invoiced = fees.reduce((a, f) => a + num(f.amount_due), 0) || 1;
    const efficiency = {
      thisPct: (collected(thisTerm) / invoiced) * 100,
      lastPct: (collected(lastTerm) / invoiced) * 100,
    };

    // Fee collection by class.
    const classMap = new Map<
      string,
      { id: string; label: string; collected: number; outstanding: number }
    >();
    for (const r of feeByClass) {
      const c = r.students?.classes;
      if (!c) continue;
      const cur = classMap.get(c.id) ?? {
        id: c.id,
        label: `${c.name}${c.section ? `·${c.section}` : ""}`,
        collected: 0,
        outstanding: 0,
      };
      cur.collected += num(r.amount_paid);
      cur.outstanding += Math.max(0, num(r.amount_due) - num(r.amount_paid));
      classMap.set(c.id, cur);
    }
    const byClass = Array.from(classMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true }),
    );

    // Top 10 overdue accounts.
    const overdueRows = await this.prisma.fee_assignments.findMany({
      where: { status: { not: "paid" }, due_date: { lt: new Date(todayStr) } },
      take: 200,
      select: {
        id: true,
        student_id: true,
        amount_due: true,
        amount_paid: true,
        due_date: true,
        students: { select: { admission_no: true, profiles: { select: { full_name: true } } } },
      },
    });
    const overdue = overdueRows
      .map((r) => ({
        id: r.id,
        student_id: r.student_id,
        name: r.students?.profiles?.full_name || r.students?.admission_no || "—",
        admission_no: r.students?.admission_no ?? null,
        amount: Math.max(0, num(r.amount_due) - num(r.amount_paid)),
        days: r.due_date
          ? Math.max(0, Math.floor((Date.now() - r.due_date.getTime()) / 86_400_000))
          : 0,
      }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return {
      revenue,
      outstanding,
      todaysCollections,
      refunds,
      payrollPeriod,
      expensePeriod,
      trend,
      efficiency,
      byClass,
      overdue,
    };
  }

  /** Recent payments for the reconciliation grid (accountant|admin). */
  async paymentsForReconciliation(actor: AuthUser, limit = 50) {
    this.assertFinance(actor);
    const rows = await this.prisma.payments.findMany({
      orderBy: { paid_at: "desc" },
      take: Math.min(limit, 200),
      select: {
        id: true,
        amount: true,
        paid_at: true,
        method: true,
        status: true,
        receipt_no: true,
      },
    });
    return rows.map((p) => ({
      id: p.id,
      amount: p.amount,
      paidAt: p.paid_at,
      method: p.method,
      status: p.status,
      receiptNo: p.receipt_no,
    }));
  }

  async listReconciliations(actor: AuthUser) {
    this.assertFinance(actor);
    const rows = await this.prisma.payment_reconciliations.findMany({
      select: { payment_id: true, bank_ref: true, reconciled_at: true },
    });
    return rows.map((r) => ({
      paymentId: r.payment_id,
      bankRef: r.bank_ref,
      reconciledAt: r.reconciled_at,
    }));
  }

  async reconcile(actor: AuthUser, paymentId: string, bankRef: string) {
    this.assertFinance(actor);
    // payment_id is unique — upsert keeps "reconcile" idempotent.
    await this.prisma.payment_reconciliations.upsert({
      where: { payment_id: paymentId },
      create: { payment_id: paymentId, bank_ref: bankRef, reconciled_by: actor.id },
      update: { bank_ref: bankRef, reconciled_by: actor.id },
    });
    return { ok: true };
  }

  async unreconcile(actor: AuthUser, paymentId: string) {
    this.assertFinance(actor);
    await this.prisma.payment_reconciliations.deleteMany({ where: { payment_id: paymentId } });
    return { ok: true };
  }

  async listExpenses(actor: AuthUser, page = 1, pageSize = 50, status?: string) {
    this.assertFinance(actor);
    const where: Prisma.expensesWhereInput = status ? { approval_status: status } : {};
    const [total, rows, sums] = await Promise.all([
      this.prisma.expenses.count({ where }),
      this.prisma.expenses.findMany({
        where,
        orderBy: { expense_date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.expenses.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { total, page, pageSize, totalAmount: sums._sum.amount ?? 0, rows };
  }

  async createExpense(
    actor: AuthUser,
    data: {
      category: string;
      amount: number;
      expenseDate: string;
      notes?: string;
      vendor?: string;
    },
  ) {
    this.assertFinance(actor);
    const row = await this.prisma.expenses.create({
      data: {
        category: data.category,
        amount: new Prisma.Decimal(data.amount),
        expense_date: new Date(data.expenseDate),
        notes: data.notes ?? null,
        vendor: data.vendor ?? null,
        created_by: actor.id,
      },
    });
    return { id: row.id };
  }

  /** Running ledger: payments in, expenses out, merged by date. */
  async ledger(actor: AuthUser, from?: string, to?: string, limit = 200) {
    this.assertFinance(actor);
    const dateFilter = (col: "paid_at" | "expense_date") => ({
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    });
    const [payments, expenses] = await Promise.all([
      this.prisma.payments.findMany({
        // The ledger only counts successful income, matching finance.ledger.tsx.
        where: {
          status: "successful",
          ...(from || to ? { paid_at: dateFilter("paid_at") } : {}),
        },
        orderBy: { paid_at: "desc" },
        take: limit,
        select: { id: true, amount: true, paid_at: true, method: true, receipt_no: true },
      }),
      this.prisma.expenses.findMany({
        where: from || to ? { expense_date: dateFilter("expense_date") } : {},
        orderBy: { expense_date: "desc" },
        take: limit,
        select: { id: true, amount: true, expense_date: true, category: true },
      }),
    ]);
    const entries = [
      ...payments.map((p) => ({
        id: p.id,
        kind: "credit" as const,
        amount: p.amount,
        date: p.paid_at,
        label: `Fee payment (${p.method}) ${p.receipt_no}`,
      })),
      ...expenses.map((e) => ({
        id: e.id,
        kind: "debit" as const,
        amount: e.amount,
        date: e.expense_date,
        label: `Expense: ${e.category}`,
      })),
    ].sort((a, b) => new Date(b.date as any).getTime() - new Date(a.date as any).getTime());
    return entries.slice(0, limit);
  }
}

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
        where: from || to ? { paid_at: dateFilter("paid_at") } : {},
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

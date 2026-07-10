import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../infra/database/prisma.service";
import type { AuthUser } from "../../common/decorators/current-user.decorator";

/**
 * RLS translation (api/db/rls-policies-extracted.csv):
 *   library_books: lb_read_all (qual true) -> any authenticated read; lb_admin_all -> admin write
 *   library_loans: ll_admin_all -> admin; ll_read_self -> student's own loans OR
 *                  parent of the borrowing student (both EXISTS branches reproduced)
 */
@Injectable()
export class LibraryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listBooks(_actor: AuthUser, page = 1, pageSize = 50, q?: string) {
    const where: Prisma.library_booksWhereInput = q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { author: { contains: q, mode: "insensitive" } },
            { isbn: { contains: q, mode: "insensitive" } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.library_books.count({ where }),
      this.prisma.library_books.findMany({
        where,
        orderBy: { title: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, rows };
  }

  async listLoans(actor: AuthUser, page = 1, pageSize = 50, studentId?: string) {
    let scope: Prisma.library_loansWhereInput | null = null;
    if (actor.roles.includes("admin")) scope = {};
    else if (actor.roles.includes("student")) scope = { students: { profile_id: actor.id } };
    else if (actor.roles.includes("parent")) {
      scope = { students: { parent_student: { some: { parent_id: actor.id } } } };
    }
    if (scope === null) return { total: 0, page, pageSize, rows: [] };

    const where: Prisma.library_loansWhereInput = {
      AND: [scope, studentId ? { student_id: studentId } : {}],
    };
    const [total, rows] = await Promise.all([
      this.prisma.library_loans.count({ where }),
      this.prisma.library_loans.findMany({
        where,
        orderBy: { issued_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          library_books: { select: { title: true, author: true } },
          students: {
            select: { admission_no: true, profiles: { select: { full_name: true } } },
          },
          teachers: { select: { full_name: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: rows.map((l) => ({
        id: l.id,
        bookTitle: l.library_books?.title ?? null,
        bookAuthor: l.library_books?.author ?? null,
        // Borrower identity (name + admission no / borrower type) on every record.
        borrowerType: l.borrower_type,
        studentId: l.student_id,
        borrowerName: l.students?.profiles?.full_name ?? l.teachers?.full_name ?? null,
        admissionNo: l.students?.admission_no ?? null,
        issuedAt: l.issued_at,
        dueAt: l.due_at,
        returnedAt: l.returned_at,
        status: l.returned_at ? "returned" : "issued",
      })),
    };
  }

  /** ll_admin_all is the only write policy — issuing/returning is admin. */
  async returnLoan(actor: AuthUser, loanId: string) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
    await this.prisma.library_loans.update({
      where: { id: loanId },
      data: { returned_at: new Date() },
    });
    return { ok: true };
  }
}

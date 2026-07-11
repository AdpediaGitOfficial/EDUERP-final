import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
          library_books: { select: { id: true, title: true, author: true } },
          students: {
            select: {
              id: true,
              admission_no: true,
              profiles: { select: { full_name: true } },
              classes: { select: { name: true, section: true } },
            },
          },
          teachers: {
            select: {
              id: true,
              full_name: true,
              subject: true,
              staff: { select: { employee_code: true } },
            },
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
        bookId: l.book_id,
        bookTitle: l.library_books?.title ?? null,
        bookAuthor: l.library_books?.author ?? null,
        borrowerType: l.borrower_type,
        studentId: l.student_id,
        teacherId: l.teacher_id,
        borrowerName: l.students?.profiles?.full_name ?? l.teachers?.full_name ?? null,
        admissionNo: l.students?.admission_no ?? null,
        className: l.students?.classes
          ? `${l.students.classes.name}${l.students.classes.section ? "-" + l.students.classes.section : ""}`
          : null,
        employeeCode: l.teachers?.staff?.employee_code ?? null,
        subject: l.teachers?.subject ?? null,
        issuedAt: l.issued_at,
        dueAt: l.due_at,
        returnedAt: l.returned_at,
        fineAmount: l.fine_amount,
        fineStatus: l.fine_status,
        fineSettledAt: l.fine_settled_at,
        status: l.returned_at ? "returned" : "issued",
      })),
    };
  }

  private assertAdmin(actor: AuthUser) {
    if (!actor.roles.includes("admin")) throw new ForbiddenException();
  }

  /** lb_admin_all — admins add catalogue titles. */
  async createBook(
    actor: AuthUser,
    data: {
      title: string;
      author?: string;
      isbn?: string;
      category?: string;
      copies?: number;
    },
  ) {
    this.assertAdmin(actor);
    const copies = Math.max(1, data.copies ?? 1);
    const row = await this.prisma.library_books.create({
      data: {
        title: data.title,
        author: data.author || null,
        isbn: data.isbn || null,
        category: data.category || null,
        total_copies: copies,
        available_copies: copies,
      },
    });
    return { id: row.id };
  }

  /**
   * ll_admin_all — issue a book to a student or teacher. Decrements the book's
   * available copies in the same transaction so the catalogue stays consistent.
   */
  async issueLoan(
    actor: AuthUser,
    data: {
      bookId: string;
      borrowerType: "student" | "teacher";
      borrowerId: string;
      dueAt: string;
    },
  ) {
    this.assertAdmin(actor);
    const book = await this.prisma.library_books.findUnique({ where: { id: data.bookId } });
    if (!book) throw new NotFoundException("Book not found");
    if (book.available_copies <= 0) throw new BadRequestException("No copies available");
    const [loan] = await this.prisma.$transaction([
      this.prisma.library_loans.create({
        data: {
          book_id: data.bookId,
          borrower_type: data.borrowerType,
          student_id: data.borrowerType === "student" ? data.borrowerId : null,
          teacher_id: data.borrowerType === "teacher" ? data.borrowerId : null,
          due_at: new Date(data.dueAt),
        },
      }),
      this.prisma.library_books.update({
        where: { id: data.bookId },
        data: { available_copies: { decrement: 1 } },
      }),
    ]);
    return { id: loan.id };
  }

  /**
   * ll_admin_all — return a book. Records an optional fine (pending) and restores
   * a copy to the catalogue (capped at total_copies).
   */
  async returnLoan(actor: AuthUser, loanId: string, fineAmount = 0) {
    this.assertAdmin(actor);
    const loan = await this.prisma.library_loans.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException("Loan not found");
    if (loan.returned_at) throw new BadRequestException("Already returned");
    const book = await this.prisma.library_books.findUnique({ where: { id: loan.book_id } });
    const fine = Math.max(0, fineAmount);
    await this.prisma.$transaction([
      this.prisma.library_loans.update({
        where: { id: loanId },
        data: {
          returned_at: new Date(),
          fine_amount: new Prisma.Decimal(fine),
          fine_status: fine > 0 ? "pending" : "none",
        },
      }),
      this.prisma.library_books.update({
        where: { id: loan.book_id },
        data: {
          available_copies: Math.min(book?.total_copies ?? 1, (book?.available_copies ?? 0) + 1),
        },
      }),
    ]);
    return { ok: true };
  }

  /** ll_admin_all — settle an outstanding fine (paid or waived). */
  async settleFine(actor: AuthUser, loanId: string, status: "paid" | "waived") {
    this.assertAdmin(actor);
    const loan = await this.prisma.library_loans.findUnique({ where: { id: loanId } });
    if (!loan) throw new NotFoundException("Loan not found");
    await this.prisma.library_loans.update({
      where: { id: loanId },
      data: { fine_status: status, fine_settled_at: new Date() },
    });
    return { ok: true };
  }
}

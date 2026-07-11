import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from "class-validator";
import { LibraryService } from "./library.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class CreateBookDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  isbn?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  copies?: number;
}

class IssueLoanDto {
  @IsUUID()
  bookId: string;

  @IsIn(["student", "teacher"])
  borrowerType: "student" | "teacher";

  @IsUUID()
  borrowerId: string;

  @IsDateString()
  dueAt: string;
}

class ReturnLoanDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  fineAmount?: number;
}

class SettleFineDto {
  @IsIn(["paid", "waived"])
  status: "paid" | "waived";
}

@UseGuards(JwtAuthGuard)
@Controller("library")
export class LibraryController {
  constructor(@Inject(LibraryService) private readonly library: LibraryService) {}

  @Get("books")
  books(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("q") q?: string,
  ) {
    return this.library.listBooks(actor, page ?? 1, Math.min(pageSize ?? 50, 500), q);
  }

  @Post("books")
  createBook(@CurrentUser() actor: AuthUser, @Body() dto: CreateBookDto) {
    return this.library.createBook(actor, dto);
  }

  @Get("loans")
  loans(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("studentId") studentId?: string,
  ) {
    return this.library.listLoans(actor, page ?? 1, Math.min(pageSize ?? 50, 500), studentId);
  }

  @Post("loans")
  issueLoan(@CurrentUser() actor: AuthUser, @Body() dto: IssueLoanDto) {
    return this.library.issueLoan(actor, dto);
  }

  @Post("loans/:id/return")
  returnLoan(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: ReturnLoanDto) {
    return this.library.returnLoan(actor, id, dto.fineAmount ?? 0);
  }

  @Post("loans/:id/fine")
  settleFine(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: SettleFineDto) {
    return this.library.settleFine(actor, id, dto.status);
  }
}

import {
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { LibraryService } from "./library.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

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
    return this.library.listBooks(actor, page ?? 1, Math.min(pageSize ?? 50, 200), q);
  }

  @Get("loans")
  loans(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("studentId") studentId?: string,
  ) {
    return this.library.listLoans(actor, page ?? 1, Math.min(pageSize ?? 50, 200), studentId);
  }

  @Post("loans/:id/return")
  returnLoan(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.library.returnLoan(actor, id);
  }
}

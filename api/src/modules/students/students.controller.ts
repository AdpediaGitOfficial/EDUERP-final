import { Controller, Get, Inject, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { StudentsService } from "./students.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

@UseGuards(JwtAuthGuard)
@Controller("students")
export class StudentsController {
  constructor(@Inject(StudentsService) private readonly students: StudentsService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("q") q?: string,
    @Query("classId") classId?: string,
  ) {
    return this.students.list(actor, page ?? 1, Math.min(pageSize ?? 50, 200), q, classId);
  }

  @Get(":id")
  get(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.students.get(actor, id);
  }
}

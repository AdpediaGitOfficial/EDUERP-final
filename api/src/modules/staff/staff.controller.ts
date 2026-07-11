import { Controller, Get, Inject, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { StaffService } from "./staff.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

@UseGuards(JwtAuthGuard)
@Controller()
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get("staff")
  listStaff(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("q") q?: string,
  ) {
    return this.staff.listStaff(actor, page ?? 1, Math.min(pageSize ?? 50, 200), q);
  }

  @Get("staff/:id")
  getStaff(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.staff.getStaff(actor, id);
  }

  @Get("teachers")
  listTeachers(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("q") q?: string,
  ) {
    return this.staff.listTeachers(actor, page ?? 1, Math.min(pageSize ?? 50, 200), q);
  }

  @Get("teachers/:id/detail")
  teacherDetail(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.staff.teacherDetail(actor, id);
  }

  @Get("teachers/:id")
  getTeacher(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.staff.getTeacher(actor, id);
  }

  @Get("teachers/:id/classes")
  teacherClasses(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.staff.listTeacherClasses(actor, id);
  }
}

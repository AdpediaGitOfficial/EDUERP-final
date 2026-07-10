import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { AcademicsService } from "./academics.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

@UseGuards(JwtAuthGuard)
@Controller()
export class AcademicsController {
  constructor(@Inject(AcademicsService) private readonly academics: AcademicsService) {}

  @Get("classes")
  listClasses(@CurrentUser() actor: AuthUser) {
    return this.academics.listClasses(actor);
  }

  @Get("classes/:id")
  getClass(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.academics.getClass(actor, id);
  }

  @Get("subjects")
  listSubjects(@CurrentUser() actor: AuthUser, @Query("classId") classId?: string) {
    return this.academics.listSubjects(actor, classId);
  }

  @Get("timetable")
  listTimetable(
    @CurrentUser() actor: AuthUser,
    @Query("classId") classId?: string,
    @Query("teacherId") teacherId?: string,
  ) {
    return this.academics.listTimetable(actor, classId, teacherId);
  }
}

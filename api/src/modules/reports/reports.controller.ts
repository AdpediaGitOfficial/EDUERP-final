import { Controller, Get, Inject, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

@UseGuards(JwtAuthGuard)
@Controller("reports")
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get("admin-dashboard")
  adminDashboard(@CurrentUser() actor: AuthUser) {
    return this.reports.adminDashboard(actor);
  }

  @Get("teacher-dashboard")
  teacherDashboard(@CurrentUser() actor: AuthUser) {
    return this.reports.teacherDashboard(actor);
  }

  @Get("student-dashboard")
  studentDashboard(@CurrentUser() actor: AuthUser) {
    return this.reports.studentDashboard(actor);
  }

  @Get("parent-dashboard")
  parentDashboard(@CurrentUser() actor: AuthUser) {
    return this.reports.parentDashboard(actor);
  }

  @Get("audit-log")
  auditLog(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.reports.auditLog(actor, page ?? 1, Math.min(pageSize ?? 50, 200));
  }

  @Get("analytics")
  analytics(@CurrentUser() actor: AuthUser) {
    return this.reports.analytics(actor);
  }

  @Get("generator")
  generator(
    @CurrentUser() actor: AuthUser,
    @Query("type") type: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.reports.generator(actor, type, from, to);
  }
}

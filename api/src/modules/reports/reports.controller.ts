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

  @Get("audit-log")
  auditLog(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.reports.auditLog(actor, page ?? 1, Math.min(pageSize ?? 50, 200));
  }
}

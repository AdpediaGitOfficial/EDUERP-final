import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { HrService } from "./hr.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { IsDateString, IsIn, IsOptional, IsString, MinLength } from "class-validator";

class CreateLeaveDto {
  @IsString()
  @MinLength(2)
  leaveType: string;

  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

class DecideLeaveDto {
  @IsIn(["approved", "rejected"])
  status: "approved" | "rejected";
}

@UseGuards(JwtAuthGuard)
@Controller("hr")
export class HrController {
  constructor(@Inject(HrService) private readonly hr: HrService) {}

  @Get("leave-requests")
  leaveRequests(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("status") status?: string,
  ) {
    return this.hr.listLeaveRequests(actor, page ?? 1, Math.min(pageSize ?? 50, 200), status);
  }

  @Post("leave-requests")
  createLeave(@CurrentUser() actor: AuthUser, @Body() dto: CreateLeaveDto) {
    return this.hr.createLeaveRequest(actor, dto);
  }

  @Patch("leave-requests/:id/decision")
  decide(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: DecideLeaveDto) {
    return this.hr.decideLeaveRequest(actor, id, dto.status);
  }

  @Get("leave-balances")
  leaveBalances(@CurrentUser() actor: AuthUser, @Query("staffId") staffId?: string) {
    return this.hr.listLeaveBalances(actor, staffId);
  }

  @Get("payroll-runs")
  payrollRuns(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.hr.listPayrollRuns(actor, page ?? 1, Math.min(pageSize ?? 50, 200));
  }

  @Get("expense-claims")
  expenseClaims(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.hr.listExpenseClaims(actor, page ?? 1, Math.min(pageSize ?? 50, 200));
  }
}

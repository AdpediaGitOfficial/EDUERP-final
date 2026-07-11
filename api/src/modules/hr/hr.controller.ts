import {
  Body,
  Controller,
  Delete,
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
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MinLength } from "class-validator";

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

class StaffDto {
  @IsString() @MinLength(1) employee_code: string;
  @IsString() @MinLength(1) full_name: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @MinLength(1) department: string;
  @IsString() @MinLength(1) designation: string;
  @IsOptional() @IsString() employment_type?: string;
  @IsOptional() @IsString() join_date?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() confirmation_status?: string;
}

class StatusDto {
  @IsIn(["active", "on_leave", "inactive"]) status: string;
}

class DepartmentDto {
  @IsString() @MinLength(1) name: string;
  @IsString() @MinLength(1) code: string;
  @IsOptional() @IsNumber() budget?: number;
  @IsOptional() @IsString() description?: string;
}

class DesignationDto {
  @IsString() @MinLength(1) title: string;
  @IsOptional() @IsNumber() level?: number;
  @IsOptional() @IsString() salary_grade?: string;
  @IsOptional() @IsNumber() min_pay?: number;
  @IsOptional() @IsNumber() max_pay?: number;
}

class AttnUpsertDto {
  @IsString() @MinLength(1) teacherId: string;
  @IsDateString() date: string;
  @IsIn(["present", "absent", "late", "leave", "half_day", "wfh"]) status: string;
  @IsString() @MinLength(1) reason: string;
  @IsOptional() @IsString() checkIn?: string;
}

@UseGuards(JwtAuthGuard)
@Controller("hr")
export class HrController {
  constructor(@Inject(HrService) private readonly hr: HrService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() actor: AuthUser) {
    return this.hr.dashboard(actor);
  }

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

  @Patch("expense-claims/:id/decision")
  decideExpense(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: DecideLeaveDto,
  ) {
    return this.hr.decideExpenseClaim(actor, id, dto.status);
  }

  // ---- Staff directory ----------------------------------------------------
  @Get("staff")
  listStaff(@CurrentUser() actor: AuthUser) {
    return this.hr.listStaff(actor);
  }

  @Post("staff")
  createStaff(@CurrentUser() actor: AuthUser, @Body() dto: StaffDto) {
    return this.hr.createStaff(actor, dto);
  }

  @Get("staff/:id")
  staffDetail(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.hr.staffDetail(actor, id);
  }

  @Patch("staff/:id")
  updateStaff(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: StaffDto) {
    return this.hr.updateStaff(actor, id, dto);
  }

  @Patch("staff/:id/status")
  setStaffStatus(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: StatusDto) {
    return this.hr.setStaffStatus(actor, id, dto.status);
  }

  // ---- Departments --------------------------------------------------------
  @Get("departments")
  listDepartments() {
    return this.hr.listDepartments();
  }

  @Post("departments")
  createDepartment(@CurrentUser() actor: AuthUser, @Body() dto: DepartmentDto) {
    return this.hr.createDepartment(actor, dto);
  }

  @Patch("departments/:id")
  updateDepartment(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: DepartmentDto,
  ) {
    return this.hr.updateDepartment(actor, id, dto);
  }

  @Delete("departments/:id")
  deleteDepartment(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.hr.deleteDepartment(actor, id);
  }

  // ---- Designations -------------------------------------------------------
  @Get("designations")
  listDesignations() {
    return this.hr.listDesignations();
  }

  @Post("designations")
  createDesignation(@CurrentUser() actor: AuthUser, @Body() dto: DesignationDto) {
    return this.hr.createDesignation(actor, dto);
  }

  @Patch("designations/:id")
  updateDesignation(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: DesignationDto,
  ) {
    return this.hr.updateDesignation(actor, id, dto);
  }

  @Delete("designations/:id")
  deleteDesignation(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.hr.deleteDesignation(actor, id);
  }

  // ---- Teacher attendance management --------------------------------------
  @Get("attendance/teachers")
  attnTeachers(@CurrentUser() actor: AuthUser) {
    return this.hr.attnTeachers(actor);
  }

  @Get("attendance/day")
  attnDay(@CurrentUser() actor: AuthUser, @Query("date") date: string) {
    return this.hr.attnDay(actor, date);
  }

  @Get("attendance/month")
  attnMonth(@CurrentUser() actor: AuthUser, @Query("month") month: string) {
    return this.hr.attnMonth(actor, month);
  }

  @Get("attendance/corrections")
  attnCorrections(@CurrentUser() actor: AuthUser) {
    return this.hr.attnCorrections(actor);
  }

  @Post("attendance/upsert")
  attnUpsert(@CurrentUser() actor: AuthUser, @Body() dto: AttnUpsertDto) {
    return this.hr.attnUpsert(actor, dto);
  }
}

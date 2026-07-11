import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import { EssService } from "./ess.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class ApplyLeaveDto {
  @IsString() leave_type!: string;
  @IsString() start_date!: string;
  @IsString() end_date!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class ExpenseDto {
  @IsString() category!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

class GrievanceDto {
  @IsString() @MinLength(1) @MaxLength(200) subject!: string;
  @IsString() @MinLength(1) @MaxLength(2000) message!: string;
}

/** Employee Self-Service — everything scoped to the caller's own staff record. */
@UseGuards(JwtAuthGuard)
@Controller("ess")
export class EssController {
  constructor(@Inject(EssService) private readonly ess: EssService) {}

  @Get("me")
  me(@CurrentUser() actor: AuthUser) {
    return this.ess.me(actor);
  }

  @Get("summary")
  summary(@CurrentUser() actor: AuthUser) {
    return this.ess.summary(actor);
  }

  @Get("leave")
  leave(@CurrentUser() actor: AuthUser) {
    return this.ess.leave(actor);
  }

  @Post("leave")
  applyLeave(@CurrentUser() actor: AuthUser, @Body() dto: ApplyLeaveDto) {
    return this.ess.applyLeave(actor, dto);
  }

  @Get("payslips")
  payslips(@CurrentUser() actor: AuthUser) {
    return this.ess.payslips(actor);
  }

  @Get("attendance")
  attendance(@CurrentUser() actor: AuthUser) {
    return this.ess.attendance(actor);
  }

  @Get("expenses")
  expenses(@CurrentUser() actor: AuthUser) {
    return this.ess.expenses(actor);
  }

  @Post("expenses")
  submitExpense(@CurrentUser() actor: AuthUser, @Body() dto: ExpenseDto) {
    return this.ess.submitExpense(actor, dto);
  }

  @Get("grievances")
  grievances(@CurrentUser() actor: AuthUser) {
    return this.ess.grievances(actor);
  }

  @Post("grievances")
  submitGrievance(@CurrentUser() actor: AuthUser, @Body() dto: GrievanceDto) {
    return this.ess.submitGrievance(actor, dto);
  }

  @Get("documents")
  documents(@CurrentUser() actor: AuthUser) {
    return this.ess.documents(actor);
  }

  @Get("performance")
  performance(@CurrentUser() actor: AuthUser) {
    return this.ess.performance(actor);
  }

  @Get("training")
  training(@CurrentUser() actor: AuthUser) {
    return this.ess.training(actor);
  }

  @Get("assets")
  assets(@CurrentUser() actor: AuthUser) {
    return this.ess.assets(actor);
  }
}

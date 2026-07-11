import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { ReceptionService } from "./reception.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class CheckInDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  purpose: string;

  @IsOptional()
  @IsString()
  meetingPerson?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  idReference?: string;
}

class CreateEnquiryDto {
  @IsString()
  @MinLength(1)
  studentName: string;

  @IsOptional()
  @IsString()
  parentName?: string;

  @IsOptional()
  @IsString()
  parentPhone?: string;

  @IsOptional()
  @IsString()
  parentEmail?: string;

  @IsOptional()
  @IsString()
  gradeApplying?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class EnquiryStatusDto {
  @IsIn(["new", "follow_up", "converted", "lost"])
  status: string;
}

class AssignDto {
  @IsUUID()
  routeId: string;

  @IsOptional()
  @IsUUID()
  stopId?: string;

  @IsUUID()
  studentId: string;
}

@UseGuards(JwtAuthGuard)
@Controller("reception")
export class ReceptionController {
  constructor(@Inject(ReceptionService) private readonly reception: ReceptionService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() actor: AuthUser) {
    return this.reception.dashboard(actor);
  }

  @Get("visitors")
  visitors(@CurrentUser() actor: AuthUser) {
    return this.reception.listVisitors(actor);
  }

  @Post("visitors")
  checkIn(@CurrentUser() actor: AuthUser, @Body() dto: CheckInDto) {
    return this.reception.checkInVisitor(actor, dto);
  }

  @Post("visitors/:id/checkout")
  checkOut(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.reception.checkOutVisitor(actor, id);
  }

  @Get("admissions")
  admissions(@CurrentUser() actor: AuthUser) {
    return this.reception.listEnquiries(actor);
  }

  @Post("admissions")
  createEnquiry(@CurrentUser() actor: AuthUser, @Body() dto: CreateEnquiryDto) {
    return this.reception.createEnquiry(actor, dto);
  }

  @Patch("admissions/:id/status")
  enquiryStatus(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: EnquiryStatusDto,
  ) {
    return this.reception.updateEnquiryStatus(actor, id, dto.status);
  }

  @Get("routes")
  routes(@CurrentUser() actor: AuthUser) {
    return this.reception.listRoutes(actor);
  }

  @Get("routes/:id/stops")
  stops(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.reception.listStops(actor, id);
  }

  @Get("route-students")
  assignments(@CurrentUser() actor: AuthUser) {
    return this.reception.listAssignments(actor);
  }

  @Post("route-students")
  assign(@CurrentUser() actor: AuthUser, @Body() dto: AssignDto) {
    return this.reception.assignStudent(actor, dto);
  }
}

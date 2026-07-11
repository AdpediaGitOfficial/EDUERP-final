import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { TeacherProfileService } from "./teacher-profile.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class CoreDto {
  @IsOptional() @IsString() @MinLength(1) fullName?: string;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() qualification?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(70) experienceYears?: number;
  @IsOptional() @IsString() joinedDate?: string;
  @IsOptional() @IsIn(["active", "on_leave", "inactive"]) status?: string;
}

class EmergencyContactDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
}
class BankDetailsDto {
  @IsOptional() @IsString() bank?: string;
  @IsOptional() @IsString() account?: string;
  @IsOptional() @IsString() ifsc?: string;
}
class StaffProfileDto {
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsIn(["full_time", "part_time", "contract", "visiting"]) employmentType?: string;
  @IsOptional() @IsIn(["confirmed", "probation", "notice_period"]) confirmationStatus?: string;
  @IsOptional() @IsString() probationEndDate?: string | null;
  @IsOptional() @IsString() joinDate?: string;
  @IsOptional() @IsString() dob?: string | null;
  @IsOptional() @IsString() bloodGroup?: string | null;
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(40) skills?: string[];
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto | null;
  @IsOptional() @IsString() medicalInfo?: string | null;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BankDetailsDto)
  bankDetails?: BankDetailsDto | null;
}

class QualificationDto {
  @IsString() @MinLength(1) degree: string;
  @IsOptional() @IsString() institution?: string;
  @IsOptional() @IsInt() @Min(1950) @Max(2100) year?: number;
  @IsOptional() @IsString() certification?: string;
}
class ExperienceDto {
  @IsString() @MinLength(1) employer: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
}
class ReviewDto {
  @IsString() @MinLength(1) period: string;
  @IsNumber() @Min(0) @Max(5) rating: number;
  @IsOptional() @IsString() notes?: string;
}
class HistoryDto {
  @IsString() @MinLength(1) eventType: string;
  @IsString() @MinLength(1) effectiveDate: string;
  @IsOptional() @IsString() fromValue?: string;
  @IsOptional() @IsString() toValue?: string;
  @IsOptional() @IsString() notes?: string;
}
class PayrollDto {
  @IsString() @MinLength(7) month: string;
  @IsNumber() @Min(0) baseSalary: number;
  @IsOptional() @IsNumber() @Min(0) allowances?: number;
  @IsOptional() @IsNumber() @Min(0) deductions?: number;
  @IsOptional() @IsIn(["pending", "processed", "paid"]) status?: string;
  @IsOptional() @IsString() payDate?: string;
  @IsOptional() @IsString() notes?: string;
}
class TrainingDto {
  @IsString() @MinLength(1) title: string;
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() programType?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsIn(["pending", "enrolled", "completed"]) status?: string;
}
class DocumentDto {
  @IsString() @MinLength(1) docType: string;
  @IsString() @MinLength(1) title: string;
  @IsOptional() @IsString() fileUrl?: string;
  @IsOptional() @IsString() expiryDate?: string;
}

class TimetableEntryDto {
  @IsString() classId: string;
  @IsOptional() @IsString() subjectId?: string | null;
  @IsInt() @Min(0) @Max(6) dayOfWeek: number;
  @IsString() startTime: string;
  @IsString() endTime: string;
  @IsOptional() @IsString() room?: string | null;
}
class SaveTimetableDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimetableEntryDto)
  @ArrayMaxSize(200)
  entries: TimetableEntryDto[];
}

@UseGuards(JwtAuthGuard)
@Controller("teachers")
export class TeacherProfileController {
  constructor(@Inject(TeacherProfileService) private readonly svc: TeacherProfileService) {}

  @Patch(":id")
  updateCore(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: CoreDto) {
    return this.svc.updateCore(actor, id, dto);
  }

  @Patch(":id/staff")
  updateStaff(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: StaffProfileDto,
  ) {
    return this.svc.updateStaffProfile(actor, id, dto);
  }

  // ---- Qualifications ----
  @Post(":id/qualifications")
  addQual(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() dto: QualificationDto) {
    return this.svc.addQualification(a, id, dto);
  }
  @Delete(":id/qualifications/:childId")
  delQual(@CurrentUser() a: AuthUser, @Param("id") id: string, @Param("childId") c: string) {
    return this.svc.deleteQualification(a, id, c);
  }

  // ---- Experience ----
  @Post(":id/experience")
  addExp(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() dto: ExperienceDto) {
    return this.svc.addExperience(a, id, dto);
  }
  @Delete(":id/experience/:childId")
  delExp(@CurrentUser() a: AuthUser, @Param("id") id: string, @Param("childId") c: string) {
    return this.svc.deleteExperience(a, id, c);
  }

  // ---- Reviews ----
  @Post(":id/reviews")
  addReview(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() dto: ReviewDto) {
    return this.svc.addReview(a, id, dto);
  }
  @Delete(":id/reviews/:childId")
  delReview(@CurrentUser() a: AuthUser, @Param("id") id: string, @Param("childId") c: string) {
    return this.svc.deleteReview(a, id, c);
  }

  // ---- Employment history ----
  @Post(":id/history")
  addHistory(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() dto: HistoryDto) {
    return this.svc.addHistory(a, id, dto);
  }
  @Delete(":id/history/:childId")
  delHistory(@CurrentUser() a: AuthUser, @Param("id") id: string, @Param("childId") c: string) {
    return this.svc.deleteHistory(a, id, c);
  }

  // ---- Payroll ----
  @Post(":id/payroll")
  addPayroll(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() dto: PayrollDto) {
    return this.svc.addPayroll(a, id, dto);
  }
  @Delete(":id/payroll/:childId")
  delPayroll(@CurrentUser() a: AuthUser, @Param("id") id: string, @Param("childId") c: string) {
    return this.svc.deletePayroll(a, id, c);
  }

  // ---- Training ----
  @Post(":id/training")
  addTraining(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() dto: TrainingDto) {
    return this.svc.addTraining(a, id, dto);
  }
  @Delete(":id/training/:childId")
  delTraining(@CurrentUser() a: AuthUser, @Param("id") id: string, @Param("childId") c: string) {
    return this.svc.deleteTraining(a, id, c);
  }

  // ---- Documents ----
  @Post(":id/documents")
  addDoc(@CurrentUser() a: AuthUser, @Param("id") id: string, @Body() dto: DocumentDto) {
    return this.svc.addDocument(a, id, dto);
  }
  @Delete(":id/documents/:childId")
  delDoc(@CurrentUser() a: AuthUser, @Param("id") id: string, @Param("childId") c: string) {
    return this.svc.deleteDocument(a, id, c);
  }

  // ---- Timetable ----
  @Get(":id/timetable")
  getTimetable(@CurrentUser() a: AuthUser, @Param("id") id: string) {
    return this.svc.getTimetable(a, id);
  }
  @Put(":id/timetable")
  saveTimetable(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() dto: SaveTimetableDto,
  ) {
    return this.svc.saveTimetable(a, id, dto.entries);
  }
}

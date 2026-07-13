import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { AdmissionsService, type AdmitDirectInput } from "./admissions.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class ApplicantDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) studentName?: string;
  @IsOptional() @IsString() gradeApplying?: string;
  @IsOptional() @IsString() parentName?: string;
  @IsOptional() @IsString() parentPhone?: string;
  @IsOptional() @IsString() parentEmail?: string;
  @IsOptional() @IsString() applicantDob?: string;
  @IsOptional() @IsString() applicantGender?: string;
  @IsOptional() @IsString() applicantAddress?: string;
  @IsOptional() @IsString() previousSchool?: string;
  @IsOptional() @IsString() bloodGroup?: string;
  @IsOptional() @IsBoolean() transportRequired?: boolean;
  @IsOptional() @IsBoolean() hostelRequired?: boolean;
  @IsOptional() @IsString() medicalNotes?: string;
  @IsOptional() @IsString() academicYear?: string;
  @IsOptional() @IsString() notes?: string;
}

class AdvanceDto {
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsString() academicYear?: string;
  @IsOptional() @IsUUID() feeStructureId?: string;
  @IsOptional() @IsUUID() parentId?: string;
}

class RejectDto {
  @IsString() @MinLength(2) reason: string;
}
class SetParentDto {
  @IsUUID() parentId: string;
}
class DocsDto {
  @IsArray() documents: unknown[];
}

class AdmitDirectDto {
  // Academic
  @IsOptional() @IsString() @MaxLength(40) admissionNo?: string;
  @IsOptional() @IsString() @MaxLength(40) rollNo?: string;
  @IsOptional() @IsString() admissionDate?: string;
  @IsUUID() classId: string;
  @IsOptional() @IsString() section?: string;
  @IsOptional() @IsString() @MaxLength(60) biometricId?: string;
  @IsOptional() @IsString() @MaxLength(500) previousSchool?: string;
  @IsOptional() @IsNumber() openingDueBalance?: number;
  // Personal
  @IsString() @MinLength(1) @MaxLength(80) firstName: string;
  @IsOptional() @IsString() @MaxLength(80) middleName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsIn(["male", "female", "other"]) gender?: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @MaxLength(60) house?: string;
  @IsOptional() @IsString() @MaxLength(10) bloodGroup?: string;
  @IsOptional() @IsString() @MaxLength(40) religion?: string;
  @IsOptional() @IsString() @MaxLength(40) aadhaarNo?: string;
  @IsOptional() @IsString() @MaxLength(40) penSssmId?: string;
  @IsOptional() @IsString() @MaxLength(60) caste?: string;
  @IsOptional() @IsString() @MaxLength(60) subCaste?: string;
  @IsOptional() @IsString() @MaxLength(40) motherTongue?: string;
  @IsOptional() @IsString() @MaxLength(80) placeOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(40) nationality?: string;
  @IsOptional() @IsBoolean() bpl?: boolean;
  @IsOptional() @IsBoolean() rte?: boolean;
  @IsOptional() @IsString() @MaxLength(30) studentPhone?: string;
  @IsOptional() @IsString() @MaxLength(255) studentEmail?: string;
  @IsOptional() @IsString() photoUrl?: string;
  // Parents
  @IsIn(["new", "existing"]) parentMode: "new" | "existing";
  @IsOptional() @IsUUID() existingParentId?: string;
  @IsOptional() @IsIn(["father", "mother", "other"]) primaryGuardian?:
    "father" | "mother" | "other";
  @IsOptional() @IsObject() father?: Record<string, unknown>;
  @IsOptional() @IsObject() mother?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(255) parentLoginEmail?: string;
  @IsOptional() @IsString() @MaxLength(120) emergencyContactName?: string;
  @IsOptional() @IsString() @MaxLength(30) emergencyContactPhone?: string;
  @IsOptional() @IsString() @MaxLength(400) guardianAddress?: string;
  @IsOptional() @IsString() @MaxLength(400) currentAddress?: string;
  @IsOptional() @IsString() @MaxLength(400) permanentAddress?: string;
  // Health & bank
  @IsOptional() @IsNumber() heightCm?: number;
  @IsOptional() @IsNumber() weightKg?: number;
  @IsOptional() @IsString() @MaxLength(1000) medicalHistory?: string;
  @IsOptional() @IsString() @MaxLength(120) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccount?: string;
  @IsOptional() @IsString() @MaxLength(20) bankIfsc?: string;
  // Fees & custom
  @IsOptional() @IsArray() @IsUUID("all", { each: true }) feeGroupIds?: string[];
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

@UseGuards(JwtAuthGuard)
@Controller("admissions")
export class AdmissionsController {
  constructor(@Inject(AdmissionsService) private readonly svc: AdmissionsService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthUser,
    @Query("stage") stage?: string,
    @Query("q") q?: string,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.svc.list(actor, { stage, q, page, pageSize });
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: ApplicantDto) {
    return this.svc.createDraft(actor, dto);
  }

  /** Preview/reserve the next admission + roll numbers for the wizard's Auto buttons. */
  @Get("next-numbers")
  nextNumbers(@CurrentUser() actor: AuthUser, @Query("classId") classId?: string) {
    return this.svc.nextNumbers(actor, classId);
  }

  /** Direct 5-step admission — creates the student + fees + parent atomically. */
  @Post("admit")
  admitDirect(@CurrentUser() actor: AuthUser, @Body() dto: AdmitDirectDto) {
    return this.svc.admitDirect(actor, dto as unknown as AdmitDirectInput);
  }

  @Get(":id")
  get(@CurrentUser() actor: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.get(actor, id);
  }

  @Patch(":id")
  save(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: ApplicantDto,
  ) {
    return this.svc.saveDraft(actor, id, dto);
  }

  @Post(":id/documents")
  docs(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: DocsDto,
  ) {
    return this.svc.setDocuments(actor, id, dto.documents);
  }

  @Post(":id/submit")
  submit(@CurrentUser() actor: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.svc.submit(actor, id);
  }

  @Post(":id/parent")
  setParent(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: SetParentDto,
  ) {
    return this.svc.setParent(actor, id, dto.parentId);
  }

  @Post(":id/advance")
  advance(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: AdvanceDto,
  ) {
    return this.svc.advance(actor, id, dto);
  }

  @Post(":id/reject")
  reject(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: RejectDto,
  ) {
    return this.svc.reject(actor, id, dto.reason);
  }
}

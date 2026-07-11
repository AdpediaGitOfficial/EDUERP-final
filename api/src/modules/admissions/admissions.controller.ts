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
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { AdmissionsService } from "./admissions.service";
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

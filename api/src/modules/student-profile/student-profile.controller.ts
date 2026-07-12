import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { StudentProfileService } from "./student-profile.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class MedicalDto {
  @IsOptional() @IsString() @MaxLength(10) bloodGroup?: string | null;
  @IsOptional() @IsString() @MaxLength(500) allergies?: string | null;
  @IsOptional() @IsString() @MaxLength(500) chronicConditions?: string | null;
  @IsOptional() @IsString() @MaxLength(500) medications?: string | null;
  @IsOptional() @IsString() @MaxLength(500) disabilities?: string | null;
  @IsOptional() @IsString() @MaxLength(120) physicianName?: string | null;
  @IsOptional() @IsString() @MaxLength(30) physicianPhone?: string | null;
  @IsOptional() @IsString() @MaxLength(120) emergencyContactName?: string | null;
  @IsOptional() @IsString() @MaxLength(30) emergencyContactPhone?: string | null;
  @IsOptional() @IsString() @MaxLength(120) insuranceProvider?: string | null;
  @IsOptional() @IsString() @MaxLength(60) insuranceNumber?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

class HostelDto {
  @IsOptional() @IsBoolean() isResident?: boolean;
  @IsOptional() @IsString() @MaxLength(60) hostelBlock?: string | null;
  @IsOptional() @IsString() @MaxLength(30) roomNo?: string | null;
  @IsOptional() @IsString() @MaxLength(30) bedNo?: string | null;
  @IsOptional() @IsString() @MaxLength(120) wardenName?: string | null;
  @IsOptional() @IsString() @MaxLength(30) wardenPhone?: string | null;
  @IsOptional() @IsString() checkInDate?: string | null;
  @IsOptional() @IsString() checkOutDate?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
}

class DisciplinaryDto {
  @IsOptional() @IsString() incidentDate?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsIn(["minor", "moderate", "major"]) severity?: string;
  @IsString() @MinLength(1) @MaxLength(2000) description: string;
  @IsOptional() @IsString() @MaxLength(2000) actionTaken?: string | null;
  @IsOptional() @IsIn(["open", "resolved"]) status?: string;
}

class DisciplinaryUpdateDto {
  @IsOptional() @IsString() incidentDate?: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsIn(["minor", "moderate", "major"]) severity?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(2000) actionTaken?: string | null;
  @IsOptional() @IsIn(["open", "resolved"]) status?: string;
}

class DocumentDto {
  @IsOptional() @IsString() @MaxLength(60) docType?: string;
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(1000) fileUrl?: string | null;
  @IsOptional() @IsString() issuedDate?: string | null;
  @IsOptional() @IsString() expiryDate?: string | null;
  @IsOptional() @IsBoolean() verified?: boolean;
}

class SendPassDto {
  @IsIn(["student", "parent"]) target: "student" | "parent";
}

class DocumentUpdateDto {
  @IsOptional() @IsString() @MaxLength(60) docType?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) fileUrl?: string | null;
  @IsOptional() @IsString() issuedDate?: string | null;
  @IsOptional() @IsString() expiryDate?: string | null;
  @IsOptional() @IsBoolean() verified?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller("students/:studentId/profile")
export class StudentProfileController {
  constructor(
    @Inject(StudentProfileService) private readonly svc: StudentProfileService,
  ) {}

  @Get()
  getProfile(
    @CurrentUser() actor: AuthUser,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
  ) {
    return this.svc.getProfile(actor, studentId);
  }

  @Get("sis")
  sisProfile(
    @CurrentUser() actor: AuthUser,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
  ) {
    return this.svc.sisProfile(actor, studentId);
  }

  @Post("send-pass")
  sendPass(
    @CurrentUser() actor: AuthUser,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
    @Body() dto: SendPassDto,
  ) {
    return this.svc.sendPass(actor, studentId, dto.target);
  }

  @Put("medical")
  saveMedical(
    @CurrentUser() actor: AuthUser,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
    @Body() dto: MedicalDto,
  ) {
    return this.svc.saveMedical(actor, studentId, dto);
  }

  @Put("hostel")
  saveHostel(
    @CurrentUser() actor: AuthUser,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
    @Body() dto: HostelDto,
  ) {
    return this.svc.saveHostel(actor, studentId, dto);
  }

  @Post("disciplinary")
  addDisciplinary(
    @CurrentUser() actor: AuthUser,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
    @Body() dto: DisciplinaryDto,
  ) {
    return this.svc.addDisciplinary(actor, studentId, dto);
  }

  @Patch("disciplinary/:id")
  updateDisciplinary(
    @CurrentUser() actor: AuthUser,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: DisciplinaryUpdateDto,
  ) {
    return this.svc.updateDisciplinary(actor, studentId, id, dto);
  }

  @Delete("disciplinary/:id")
  deleteDisciplinary(
    @CurrentUser() actor: AuthUser,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.svc.deleteDisciplinary(actor, studentId, id);
  }

  @Post("documents")
  addDocument(
    @CurrentUser() actor: AuthUser,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
    @Body() dto: DocumentDto,
  ) {
    return this.svc.addDocument(actor, studentId, dto);
  }

  @Patch("documents/:id")
  updateDocument(
    @CurrentUser() actor: AuthUser,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: DocumentUpdateDto,
  ) {
    return this.svc.updateDocument(actor, studentId, id, dto);
  }

  @Delete("documents/:id")
  deleteDocument(
    @CurrentUser() actor: AuthUser,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.svc.deleteDocument(actor, studentId, id);
  }
}

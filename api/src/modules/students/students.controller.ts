import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { streamReportCardPdf } from "../../common/pdf/report-card-pdf";
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { StudentsService } from "./students.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class LinkParentDto {
  @IsString()
  @MinLength(3)
  admissionNo: string;

  @IsUUID()
  parentId: string;
}

class AdmitStudentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsUUID()
  classId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  rollNo?: string | null;

  @IsOptional()
  @IsIn(["male", "female", "other"])
  gender?: "male" | "female" | "other" | null;
}

class PromoteDto {
  @IsUUID()
  fromClassId: string;

  @IsUUID()
  toClassId: string;

  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  exclude?: string[];
}

class BulkAssignRouteDto {
  @IsUUID()
  routeId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("all", { each: true })
  studentIds: string[];

  @IsOptional()
  @IsUUID()
  stopId?: string | null;
}

class BulkStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("all", { each: true })
  studentIds: string[];

  @IsIn(["active", "inactive", "alumni"])
  status: "active" | "inactive" | "alumni";
}

@UseGuards(JwtAuthGuard)
@Controller("students")
export class StudentsController {
  constructor(@Inject(StudentsService) private readonly students: StudentsService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("q") q?: string,
    @Query("classId") classId?: string,
  ) {
    return this.students.list(actor, page ?? 1, Math.min(pageSize ?? 50, 200), q, classId);
  }

  @Get("search")
  search(
    @CurrentUser() actor: AuthUser,
    @Query("q") q?: string,
    @Query("classId") classId?: string,
    @Query("gradeName") gradeName?: string,
    @Query("section") section?: string,
    @Query("gender") gender?: string,
    @Query("status") status?: string,
    @Query("fromDate") fromDate?: string,
    @Query("toDate") toDate?: string,
    @Query("sort") sort?: "name" | "admission_no" | "class" | "admission_date",
    @Query("dir") dir?: "asc" | "desc",
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
    @Query("offset", new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.students.search(actor, {
      q,
      classId,
      gradeName,
      section,
      gender,
      status,
      fromDate,
      toDate,
      sort,
      dir,
      limit,
      offset,
    });
  }

  @Post("row-extras")
  rowExtras(@CurrentUser() actor: AuthUser, @Body() body: { ids: string[] }) {
    return this.students.rowExtras(actor, Array.isArray(body?.ids) ? body.ids.slice(0, 500) : []);
  }

  @Get("duplicates")
  duplicates(@CurrentUser() actor: AuthUser) {
    return this.students.duplicates(actor);
  }

  @Post("link-parent")
  linkParent(@CurrentUser() actor: AuthUser, @Body() dto: LinkParentDto) {
    return this.students.linkParent(actor, dto.admissionNo, dto.parentId);
  }

  @Post("admit")
  admit(@CurrentUser() actor: AuthUser, @Body() dto: AdmitStudentDto) {
    return this.students.admit(actor, dto);
  }

  @Post("promote")
  promote(@CurrentUser() actor: AuthUser, @Body() dto: PromoteDto) {
    return this.students.promote(actor, dto.fromClassId, dto.toClassId, dto.exclude ?? []);
  }

  @Post("bulk-assign-route")
  bulkAssignRoute(@CurrentUser() actor: AuthUser, @Body() dto: BulkAssignRouteDto) {
    return this.students.bulkAssignRoute(actor, dto.routeId, dto.studentIds, dto.stopId ?? null);
  }

  @Post("bulk-status")
  bulkStatus(@CurrentUser() actor: AuthUser, @Body() dto: BulkStatusDto) {
    return this.students.bulkSetStatus(actor, dto.studentIds, dto.status);
  }

  @Get(":id/dashboard")
  dashboard(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.students.dashboard(actor, id);
  }

  @Get(":id/transport")
  transport(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.students.transport(actor, id);
  }

  @Get(":id/timetable")
  timetable(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.students.classTimetable(actor, id);
  }

  @Get(":id/notices")
  notices(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.students.notices(actor, id);
  }

  // Downloadable PDF report card (scoped like the dashboard). ?term= filters to
  // one term; omit for a full-year card.
  @Get(":id/report-card.pdf")
  async reportCard(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Res() res: Response,
    @Query("term") term?: string,
  ) {
    const data = await this.students.reportCard(actor, id, term);
    streamReportCardPdf(res, {
      schoolName: process.env.SCHOOL_NAME || "Greenwood International School",
      ...data,
    });
  }

  @Get(":id")
  get(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.students.get(actor, id);
  }
}

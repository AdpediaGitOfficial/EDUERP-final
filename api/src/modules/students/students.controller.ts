import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsString, IsUUID, MinLength } from "class-validator";
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

  @Get(":id")
  get(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.students.get(actor, id);
  }
}

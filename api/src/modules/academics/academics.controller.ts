import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from "class-validator";
import { AcademicsService } from "./academics.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class CreateClassDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsString()
  @MinLength(4)
  academicYear: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  room?: string;

  @IsOptional()
  @IsUUID()
  classTeacherId?: string;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class AcademicsController {
  constructor(@Inject(AcademicsService) private readonly academics: AcademicsService) {}

  @Get("classes")
  listClasses(@CurrentUser() actor: AuthUser, @Query("year") year?: string) {
    return this.academics.listClasses(actor, year);
  }

  @Get("classes/years")
  years(@CurrentUser() actor: AuthUser) {
    return this.academics.listYears(actor);
  }

  @Get("classes/teacher-options")
  teacherOptions(@CurrentUser() actor: AuthUser) {
    return this.academics.teacherOptions(actor);
  }

  @Post("classes")
  createClass(@CurrentUser() actor: AuthUser, @Body() dto: CreateClassDto) {
    return this.academics.createClass(actor, dto);
  }

  @Get("classes/:id")
  getClass(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.academics.getClass(actor, id);
  }

  @Get("subjects")
  listSubjects(@CurrentUser() actor: AuthUser, @Query("classId") classId?: string) {
    return this.academics.listSubjects(actor, classId);
  }

  @Get("timetable")
  listTimetable(
    @CurrentUser() actor: AuthUser,
    @Query("classId") classId?: string,
    @Query("teacherId") teacherId?: string,
  ) {
    return this.academics.listTimetable(actor, classId, teacherId);
  }
}

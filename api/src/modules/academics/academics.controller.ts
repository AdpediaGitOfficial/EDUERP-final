import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from "class-validator";
import { AcademicsService } from "./academics.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class CreateSessionDto {
  @IsString() @MinLength(4) name: string;
  @IsOptional() @IsDateString() start_date?: string;
  @IsOptional() @IsDateString() end_date?: string;
  @IsOptional() @IsIn(["active", "upcoming", "archived", "locked"]) status?: string;
  @IsOptional() @IsString() board?: string;
  @IsOptional() @IsString() curriculum?: string;
}
class UpdateSessionDto {
  @IsOptional() @IsString() @MinLength(4) name?: string;
  @IsOptional() @IsDateString() start_date?: string;
  @IsOptional() @IsDateString() end_date?: string;
  @IsOptional() @IsIn(["active", "upcoming", "archived", "locked"]) status?: string;
  @IsOptional() @IsString() board?: string;
  @IsOptional() @IsString() curriculum?: string;
  @IsOptional() @IsBoolean() promotion_locked?: boolean;
}
class SessionStatusDto {
  @IsIn(["active", "upcoming", "archived", "locked"]) status: string;
}
class CloneSessionDto {
  @IsString() @MinLength(4) name: string;
}

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

  @Get("academics/dashboard")
  academicDashboard(@CurrentUser() actor: AuthUser, @Query("year") year?: string) {
    return this.academics.academicDashboard(actor, year);
  }

  @Get("academics/integrity")
  academicIntegrity(@CurrentUser() actor: AuthUser, @Query("year") year?: string) {
    return this.academics.academicIntegrity(actor, year);
  }

  @Get("academics/sessions")
  listSessions(@CurrentUser() actor: AuthUser) {
    return this.academics.listSessions(actor);
  }

  @Post("academics/sessions")
  createSession(@CurrentUser() actor: AuthUser, @Body() dto: CreateSessionDto) {
    return this.academics.createSession(actor, dto);
  }

  @Patch("academics/sessions/:id")
  updateSession(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.academics.updateSession(actor, id, dto);
  }

  @Post("academics/sessions/:id/set-current")
  setCurrentSession(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.academics.setCurrentSession(actor, id);
  }

  @Patch("academics/sessions/:id/status")
  setSessionStatus(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: SessionStatusDto,
  ) {
    return this.academics.setSessionStatus(actor, id, dto.status);
  }

  @Post("academics/sessions/:id/clone")
  cloneSession(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: CloneSessionDto,
  ) {
    return this.academics.cloneSession(actor, id, dto.name);
  }

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

  @Get("classes/:id/detail")
  classDetail(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.academics.classDetail(actor, id);
  }

  @Get("timetable/mine")
  myTimetable(@CurrentUser() actor: AuthUser) {
    return this.academics.myTimetable(actor);
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

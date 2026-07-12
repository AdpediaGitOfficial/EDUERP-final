import {
  Body,
  Controller,
  Delete,
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

class SubjectDto {
  @IsUUID() class_id: string;
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() short_name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(["compulsory", "elective", "optional"]) subject_type?: string;
  @IsOptional() @IsIn(["theory", "practical", "both"]) nature?: string;
  @IsOptional() @IsInt() @Min(0) credits?: number;
  @IsOptional() @IsInt() @Min(0) weekly_periods?: number;
  @IsOptional() @IsInt() @Min(0) pass_marks?: number;
  @IsOptional() @IsInt() @Min(0) max_marks?: number;
  @IsOptional() @IsBoolean() lab_required?: boolean;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() color?: string;
}
class SubjectActiveDto {
  @IsBoolean() is_active: boolean;
}

class AssignTeacherSubjectDto {
  @IsUUID() teacher_id: string;
  @IsUUID() class_id: string;
  @IsUUID() subject_id: string;
  @IsOptional() @IsIn(["subject_teacher", "lab_teacher", "assistant", "coordinator"]) role?: string;
}

class RoomDto {
  @IsString() @MinLength(1) room_number: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsString() floor?: string;
  @IsOptional() @IsString() building?: string;
  @IsOptional() @IsIn(["classroom", "lab", "library", "sports", "auditorium", "activity"])
  room_type?: string;
  @IsOptional() @IsBoolean() is_smart?: boolean;
  @IsOptional() @IsBoolean() has_projector?: boolean;
  @IsOptional() @IsBoolean() is_active?: boolean;
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

  @Get("academics/teacher-subjects")
  listTeacherSubjects(
    @CurrentUser() actor: AuthUser,
    @Query("classId") classId?: string,
    @Query("teacherId") teacherId?: string,
  ) {
    return this.academics.listTeacherSubjects(actor, classId, teacherId);
  }

  @Post("academics/teacher-subjects")
  assignTeacherSubject(@CurrentUser() actor: AuthUser, @Body() dto: AssignTeacherSubjectDto) {
    return this.academics.assignTeacherSubject(actor, dto);
  }

  @Delete("academics/teacher-subjects/:id")
  unassignTeacherSubject(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.academics.unassignTeacherSubject(actor, id);
  }

  @Get("academics/teacher-workload")
  teacherWorkload(@CurrentUser() actor: AuthUser, @Query("year") year?: string) {
    return this.academics.teacherWorkload(actor, year);
  }

  @Get("academics/rooms")
  listRooms(@CurrentUser() actor: AuthUser) {
    return this.academics.listRooms(actor);
  }

  @Post("academics/rooms")
  createRoom(@CurrentUser() actor: AuthUser, @Body() dto: RoomDto) {
    return this.academics.createRoom(actor, dto);
  }

  @Patch("academics/rooms/:id")
  updateRoom(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: RoomDto) {
    return this.academics.updateRoom(actor, id, dto);
  }

  @Delete("academics/rooms/:id")
  deleteRoom(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.academics.deleteRoom(actor, id);
  }

  @Get("subjects")
  listSubjects(@CurrentUser() actor: AuthUser, @Query("classId") classId?: string) {
    return this.academics.listSubjects(actor, classId);
  }

  @Post("subjects")
  createSubject(@CurrentUser() actor: AuthUser, @Body() dto: SubjectDto) {
    return this.academics.createSubject(actor, dto);
  }

  @Patch("subjects/:id")
  updateSubject(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: SubjectDto) {
    return this.academics.updateSubject(actor, id, dto);
  }

  @Patch("subjects/:id/active")
  setSubjectActive(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: SubjectActiveDto,
  ) {
    return this.academics.setSubjectActive(actor, id, dto.is_active);
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

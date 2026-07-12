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
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
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

class CalendarEventDto {
  @IsOptional() @IsString() session?: string;
  @IsString() @MinLength(1) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional()
  @IsIn(["exam", "event", "ptm", "sports", "annual_day", "vacation", "training", "holiday", "working_day"])
  event_type?: string;
  @IsDateString() start_date: string;
  @IsOptional() @IsDateString() end_date?: string;
}

class PromotionItemDto {
  @IsUUID() student_id: string;
  @IsIn(["promoted", "detained", "passed_out"]) result: string;
}
class ExecutePromotionDto {
  @IsUUID() from_class_id: string;
  @IsOptional() @IsUUID() to_class_id?: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionItemDto)
  promotions: PromotionItemDto[];
}

class ElectiveOfferingDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() session?: string;
  @IsOptional() @IsString() grade_level?: string;
  @IsOptional() @IsInt() @Min(1) seat_capacity?: number;
  @IsOptional() @IsUUID() subject_id?: string;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
class EnrollElectiveDto {
  @IsUUID() student_id: string;
}

class TimetableSlotDto {
  @IsUUID() class_id: string;
  @IsOptional() @IsUUID() subject_id?: string;
  @IsOptional() @IsUUID() teacher_id?: string;
  @IsInt() @Min(0) day_of_week: number;
  @IsString() start_time: string;
  @IsString() end_time: string;
  @IsOptional() @IsString() room?: string;
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

  @Get("academics/reports")
  reportCatalogue() {
    return this.academics.reportCatalogue();
  }

  @Get("academics/reports/:type")
  academicReport(
    @CurrentUser() actor: AuthUser,
    @Param("type") type: string,
    @Query("year") year?: string,
  ) {
    return this.academics.academicReport(actor, type, year);
  }

  @Get("academics/calendar")
  listCalendar(@CurrentUser() actor: AuthUser, @Query("session") session?: string) {
    return this.academics.listCalendar(actor, session);
  }

  @Post("academics/calendar")
  createCalendarEvent(@CurrentUser() actor: AuthUser, @Body() dto: CalendarEventDto) {
    return this.academics.createCalendarEvent(actor, dto);
  }

  @Patch("academics/calendar/:id")
  updateCalendarEvent(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: CalendarEventDto,
  ) {
    return this.academics.updateCalendarEvent(actor, id, dto);
  }

  @Delete("academics/calendar/:id")
  deleteCalendarEvent(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.academics.deleteCalendarEvent(actor, id);
  }

  @Get("academics/promotion/preview")
  promotionPreview(@CurrentUser() actor: AuthUser, @Query("fromClassId") fromClassId: string) {
    return this.academics.promotionPreview(actor, fromClassId);
  }

  @Post("academics/promotion/execute")
  executePromotion(@CurrentUser() actor: AuthUser, @Body() dto: ExecutePromotionDto) {
    return this.academics.executePromotion(actor, dto);
  }

  @Get("academics/promotion/register")
  promotionRegister(@CurrentUser() actor: AuthUser, @Query("session") session?: string) {
    return this.academics.promotionRegister(actor, session);
  }

  @Get("academics/electives")
  listElectiveOfferings(@CurrentUser() actor: AuthUser, @Query("session") session?: string) {
    return this.academics.listElectiveOfferings(actor, session);
  }

  @Post("academics/electives")
  createElectiveOffering(@CurrentUser() actor: AuthUser, @Body() dto: ElectiveOfferingDto) {
    return this.academics.createElectiveOffering(actor, dto);
  }

  @Patch("academics/electives/:id")
  updateElectiveOffering(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: ElectiveOfferingDto,
  ) {
    return this.academics.updateElectiveOffering(actor, id, dto);
  }

  @Delete("academics/electives/:id")
  deleteElectiveOffering(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.academics.deleteElectiveOffering(actor, id);
  }

  @Get("academics/electives/:id/enrollments")
  listElectiveEnrollments(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.academics.listElectiveEnrollments(actor, id);
  }

  @Post("academics/electives/:id/enroll")
  enrollElective(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: EnrollElectiveDto,
  ) {
    return this.academics.enrollElective(actor, id, dto.student_id);
  }

  @Delete("academics/elective-enrollments/:id")
  dropElective(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.academics.dropElective(actor, id);
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

  @Post("timetable/check-conflicts")
  checkTimetableConflicts(@CurrentUser() actor: AuthUser, @Body() dto: TimetableSlotDto) {
    return this.academics.checkTimetableConflicts(actor, dto);
  }

  @Post("timetable")
  createTimetableSlot(@CurrentUser() actor: AuthUser, @Body() dto: TimetableSlotDto) {
    return this.academics.createTimetableSlot(actor, dto);
  }

  @Patch("timetable/:id")
  updateTimetableSlot(
    @CurrentUser() actor: AuthUser,
    @Param("id") id: string,
    @Body() dto: TimetableSlotDto,
  ) {
    return this.academics.updateTimetableSlot(actor, id, dto);
  }

  @Delete("timetable/:id")
  deleteTimetableSlot(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.academics.deleteTimetableSlot(actor, id);
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

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
import { HomeworkService } from "./homework.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionGuard } from "../../common/guards/permission.guard";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

class CreateHomeworkDto {
  @IsUUID()
  classId: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsString()
  @MinLength(3)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxMarks?: number;
}

class SubmitAssignmentDto {
  @IsUUID()
  homeworkId: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

class GradeDto {
  @IsInt()
  @Min(0)
  @Max(1000)
  marks: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}

class CreateExamDto {
  @IsUUID()
  classId: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsDateString()
  examDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxMarks?: number;

  @IsOptional()
  @IsString()
  term?: string;
}

class ExamResultEntryDto {
  @IsUUID()
  studentId: string;

  @IsNumber()
  @Min(0)
  marks: number;
}

class SaveExamResultsDto {
  @IsUUID()
  examId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamResultEntryDto)
  entries: ExamResultEntryDto[];
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller()
export class HomeworkController {
  constructor(@Inject(HomeworkService) private readonly homework: HomeworkService) {}

  @Get("homework")
  list(
    @CurrentUser() actor: AuthUser,
    @Query("classId") classId?: string,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.homework.listHomework(actor, classId, page ?? 1, Math.min(pageSize ?? 50, 200));
  }

  @Post("homework")
  @RequirePermission("homework.assign")
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateHomeworkDto) {
    return this.homework.createHomework(actor, dto);
  }

  @Get("assignments")
  assignments(@CurrentUser() actor: AuthUser) {
    return this.homework.studentAssignments(actor);
  }

  @Post("assignments/submit")
  submitAssignment(@CurrentUser() actor: AuthUser, @Body() dto: SubmitAssignmentDto) {
    return this.homework.submitAssignment(actor, dto.homeworkId, dto.attachmentUrl, dto.note);
  }

  @Get("homework/:id/submissions")
  submissions(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.homework.listSubmissions(actor, id);
  }

  @Post("submissions/:id/grade")
  grade(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: GradeDto) {
    return this.homework.grade(actor, id, dto.marks, dto.feedback);
  }

  @Get("exam-results")
  examResults(
    @CurrentUser() actor: AuthUser,
    @Query("studentId") studentId?: string,
    @Query("examId") examId?: string,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.homework.listExamResults(actor, { studentId, examId, page, pageSize });
  }

  @Get("exams")
  exams(@CurrentUser() actor: AuthUser, @Query("classId") classId: string) {
    return this.homework.listExams(actor, classId);
  }

  @Post("exams")
  createExam(@CurrentUser() actor: AuthUser, @Body() dto: CreateExamDto) {
    return this.homework.createExam(actor, dto);
  }

  @Post("exam-results")
  @RequirePermission("gradebook.edit")
  saveResults(@CurrentUser() actor: AuthUser, @Body() dto: SaveExamResultsDto) {
    return this.homework.saveExamResults(actor, dto.examId, dto.entries);
  }
}

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
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
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

class GradeDto {
  @IsInt()
  @Min(0)
  @Max(1000)
  marks: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}

@UseGuards(JwtAuthGuard)
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
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateHomeworkDto) {
    return this.homework.createHomework(actor, dto);
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
}

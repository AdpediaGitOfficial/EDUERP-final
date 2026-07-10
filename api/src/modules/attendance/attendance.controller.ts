import {
  Body,
  Controller,
  Get,
  Inject,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AttendanceService } from "./attendance.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsString,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

class MarkEntry {
  @IsUUID()
  studentId: string;

  @IsIn(["present", "absent", "late", "excused"])
  status: string;
}

class MarkDto {
  @IsUUID()
  classId: string;

  @IsDateString()
  date: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MarkEntry)
  entries: MarkEntry[];
}

@UseGuards(JwtAuthGuard)
@Controller("attendance")
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendance: AttendanceService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthUser,
    @Query("studentId") studentId?: string,
    @Query("classId") classId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.attendance.list(actor, { studentId, classId, from, to, page, pageSize });
  }

  @Post("mark")
  mark(@CurrentUser() actor: AuthUser, @Body() dto: MarkDto) {
    return this.attendance.mark(actor, dto.classId, dto.date, dto.entries);
  }
}

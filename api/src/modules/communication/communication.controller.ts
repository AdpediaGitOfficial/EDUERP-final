import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CommunicationService } from "./communication.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

class CreateAnnouncementDto {
  @IsString()
  @MinLength(3)
  title: string;

  @IsString()
  @MinLength(3)
  body: string;

  @IsOptional()
  @IsIn(["all", "admins", "teachers", "students", "parents", "class"])
  audience?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;
}

class CreateHolidayDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(["holiday", "vacation", "exam", "event"])
  type?: string;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class CommunicationController {
  constructor(@Inject(CommunicationService) private readonly comms: CommunicationService) {}

  @Get("announcements")
  announcements(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.comms.listAnnouncements(actor, page ?? 1, Math.min(pageSize ?? 50, 200));
  }

  @Post("announcements")
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateAnnouncementDto) {
    return this.comms.createAnnouncement(actor, dto);
  }

  @Delete("announcements/:id")
  remove(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.comms.deleteAnnouncement(actor, id);
  }

  @Get("broadcasts")
  broadcasts(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
  ) {
    return this.comms.listBroadcasts(actor, page ?? 1, Math.min(pageSize ?? 50, 200));
  }

  @Get("holidays")
  holidays(@CurrentUser() actor: AuthUser) {
    return this.comms.listHolidays(actor);
  }

  @Post("holidays")
  createHoliday(@CurrentUser() actor: AuthUser, @Body() dto: CreateHolidayDto) {
    return this.comms.createHoliday(actor, dto);
  }
}

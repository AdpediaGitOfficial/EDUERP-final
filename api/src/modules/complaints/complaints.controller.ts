import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ComplaintsService } from "./complaints.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

class CreateComplaintDto {
  @IsUUID()
  studentId: string;

  @IsString()
  @MinLength(3)
  subject: string;

  @IsString()
  @MinLength(3)
  body: string;

  @IsOptional()
  @IsIn(["low", "medium", "high"])
  severity?: string;
}

class StatusDto {
  @IsIn(["open", "in_review", "resolved", "closed"])
  status: string;
}

@UseGuards(JwtAuthGuard)
@Controller("complaints")
export class ComplaintsController {
  constructor(@Inject(ComplaintsService) private readonly complaints: ComplaintsService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("status") status?: string,
  ) {
    return this.complaints.list(actor, page ?? 1, Math.min(pageSize ?? 50, 200), status);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateComplaintDto) {
    return this.complaints.create(actor, dto);
  }

  @Patch(":id/status")
  status(@CurrentUser() actor: AuthUser, @Param("id") id: string, @Body() dto: StatusDto) {
    return this.complaints.updateStatus(actor, id, dto.status);
  }

  @Get(":id/messages")
  messages(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.complaints.messages(actor, id);
  }
}

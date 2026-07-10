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

  @Post("link-parent")
  linkParent(@CurrentUser() actor: AuthUser, @Body() dto: LinkParentDto) {
    return this.students.linkParent(actor, dto.admissionNo, dto.parentId);
  }

  @Get(":id")
  get(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.students.get(actor, id);
  }
}

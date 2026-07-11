import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { ProgressService } from "./progress.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

class AddNoteDto {
  @IsUUID() student_id: string;
  @IsString() @MinLength(1) note: string;
  @IsOptional() @IsIn(["positive", "neutral", "concern"]) tone?: string;
}

@UseGuards(JwtAuthGuard)
@Controller("progress")
export class ProgressController {
  constructor(@Inject(ProgressService) private readonly progress: ProgressService) {}

  @Get("students")
  students(@CurrentUser() actor: AuthUser) {
    return this.progress.students(actor);
  }

  @Get("notes")
  notes(@CurrentUser() actor: AuthUser) {
    return this.progress.notes(actor);
  }

  @Post("notes")
  addNote(@CurrentUser() actor: AuthUser, @Body() dto: AddNoteDto) {
    return this.progress.addNote(actor, dto);
  }
}

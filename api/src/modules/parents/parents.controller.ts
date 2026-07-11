import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { ParentsService } from "./parents.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

class CreateParentDto {
  @IsString() @MinLength(1) @MaxLength(100) fullName: string;
  @IsEmail() @MaxLength(255) email: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(40) nationalId?: string;
  @IsOptional() @IsString() @MaxLength(40) passportNo?: string;
  @IsOptional() @IsString() @MaxLength(120) company?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(120) occupation?: string;
  @IsOptional() @IsString() @MinLength(6) @MaxLength(72) password?: string;
}

class UpdateParentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) fullName?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(40) nationalId?: string | null;
  @IsOptional() @IsString() @MaxLength(40) passportNo?: string | null;
  @IsOptional() @IsString() @MaxLength(120) company?: string | null;
  @IsOptional() @IsString() @MaxLength(300) address?: string | null;
  @IsOptional() @IsString() @MaxLength(120) occupation?: string | null;
}

class LinkChildDto {
  @IsString() studentId: string;
  @IsIn(["father", "mother", "guardian", "emergency_contact"]) relationshipType: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() pickupPermission?: boolean;
  @IsOptional() @IsBoolean() feeResponsible?: boolean;
  @IsOptional() @IsBoolean() emergencyContact?: boolean;
  @IsOptional() @IsBoolean() livesWith?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller("parents")
export class ParentsController {
  constructor(@Inject(ParentsService) private readonly parents: ParentsService) {}

  @Get("search")
  search(
    @CurrentUser() actor: AuthUser,
    @Query("email") email?: string,
    @Query("phone") phone?: string,
    @Query("nationalId") nationalId?: string,
    @Query("passportNo") passportNo?: string,
    @Query("parentCode") parentCode?: string,
    @Query("q") q?: string,
  ) {
    return this.parents.search(actor, { email, phone, nationalId, passportNo, parentCode, q });
  }

  @Get("mapping")
  mapping(@CurrentUser() actor: AuthUser) {
    return this.parents.mappingIssues(actor);
  }

  @Get()
  list(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("q") q?: string,
  ) {
    return this.parents.list(actor, page ?? 1, pageSize ?? 50, q);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateParentDto) {
    return this.parents.create(actor, dto);
  }

  @Get(":id")
  profile(@CurrentUser() actor: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.parents.getProfile(actor, id);
  }

  @Patch(":id")
  update(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateParentDto,
  ) {
    return this.parents.update(actor, id, dto);
  }

  @Post(":id/children")
  linkChild(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: LinkChildDto,
  ) {
    return this.parents.linkChild(actor, id, dto.studentId, dto.relationshipType, {
      isPrimary: dto.isPrimary,
      pickupPermission: dto.pickupPermission,
      feeResponsible: dto.feeResponsible,
      emergencyContact: dto.emergencyContact,
      livesWith: dto.livesWith,
    });
  }

  @Delete(":id/children/:studentId")
  unlinkChild(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("studentId", new ParseUUIDPipe()) studentId: string,
  ) {
    return this.parents.unlinkChild(actor, id, studentId);
  }
}

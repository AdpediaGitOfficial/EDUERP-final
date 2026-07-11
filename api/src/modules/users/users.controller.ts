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
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

const APP_ROLES = [
  "admin",
  "teacher",
  "student",
  "parent",
  "hr",
  "accountant",
  "reception",
  "fleet_manager",
] as const;

class CreateUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fullName: string;

  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;

  @IsIn(APP_ROLES)
  role: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsIn(APP_ROLES)
  role?: string;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  @Roles("admin")
  list(
    @CurrentUser() actor: AuthUser,
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("pageSize", new ParseIntPipe({ optional: true })) pageSize?: number,
    @Query("q") q?: string,
    @Query("role") role?: string,
    @Query("status") status?: string,
  ) {
    return this.users.listUsers(actor, page ?? 1, Math.min(pageSize ?? 50, 200), q, {
      role: role || undefined,
      status: status === "active" || status === "inactive" ? status : undefined,
    });
  }

  @Post()
  @Roles("admin")
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.createUser(actor, dto);
  }

  @Patch("me")
  updateMe(
    @CurrentUser() actor: AuthUser,
    @Body() body: { fullName?: string; phone?: string; avatarUrl?: string | null },
  ) {
    return this.users.updateOwnProfile(actor, body);
  }

  @Get(":id")
  get(@CurrentUser() actor: AuthUser, @Param("id") id: string) {
    return this.users.getProfile(actor, id);
  }

  @Patch(":id")
  @Roles("admin")
  update(
    @CurrentUser() actor: AuthUser,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.updateUser(actor, id, dto);
  }

  @Delete(":id")
  @Roles("admin")
  remove(@CurrentUser() actor: AuthUser, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.users.deleteUser(actor, id);
  }
}

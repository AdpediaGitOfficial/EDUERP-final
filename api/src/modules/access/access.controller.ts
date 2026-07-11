import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AccessService } from "./access.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { IsBoolean, IsIn, IsString, MinLength } from "class-validator";

class SetPermissionDto {
  @IsString() @MinLength(1) userId: string;
  @IsString() @MinLength(1) key: string;
  @IsBoolean() enabled: boolean;
}

class SetRoleDto {
  @IsString() @MinLength(1) userId: string;
  @IsIn(["admin", "teacher", "student", "parent", "hr", "accountant", "reception", "fleet_manager"])
  role: string;
}

@UseGuards(JwtAuthGuard)
@Controller("access")
export class AccessController {
  constructor(@Inject(AccessService) private readonly access: AccessService) {}

  @Get("staff")
  listStaff(@CurrentUser() actor: AuthUser) {
    return this.access.listStaff(actor);
  }

  @Get("permissions/:userId")
  listPermissions(@CurrentUser() actor: AuthUser, @Param("userId") userId: string) {
    return this.access.listPermissions(actor, userId);
  }

  @Get("audit/:userId")
  listAudit(@CurrentUser() actor: AuthUser, @Param("userId") userId: string) {
    return this.access.listAudit(actor, userId);
  }

  @Post("permissions")
  setPermission(@CurrentUser() actor: AuthUser, @Body() dto: SetPermissionDto) {
    return this.access.setPermission(actor, dto);
  }

  @Patch("role")
  setRole(@CurrentUser() actor: AuthUser, @Body() dto: SetRoleDto) {
    return this.access.setRole(actor, dto);
  }

  @Get("monitoring")
  monitoring(@CurrentUser() actor: AuthUser) {
    return this.access.monitoring(actor);
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../infra/database/prisma.service";
import { PERMISSION_KEY } from "../decorators/require-permission.decorator";

/**
 * Enforces the module-level permissions toggled in Staff Access Control.
 * Revoke model: an action is allowed unless the actor has an explicit
 * staff_permissions row with enabled=false for the required key. Admins bypass.
 * A missing row means "not revoked" → allowed, so no one is locked out by
 * default and the role stays the baseline grant.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!key) return true;

    const user = ctx.switchToHttp().getRequest().user;
    if (!user?.id) throw new ForbiddenException();
    if (user.roles?.includes("admin")) return true; // admins are never restricted

    const revoked = await this.prisma.staff_permissions.findFirst({
      where: { user_id: user.id, permission_key: key, enabled: false },
      select: { id: true },
    });
    if (revoked)
      throw new ForbiddenException(
        "This action has been disabled for your account by an administrator.",
      );
    return true;
  }
}

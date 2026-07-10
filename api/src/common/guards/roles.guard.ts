import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";

/**
 * Role-level access control — the guard equivalent of RLS policies of the form
 * `USING (has_role(auth.uid(), '<role>'))`. Row-level scoping (WHERE clauses per
 * role) lives in each module's service, next to the query it scopes.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = ctx.switchToHttp().getRequest().user;
    if (!user?.roles?.some((r: string) => required.includes(r))) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}

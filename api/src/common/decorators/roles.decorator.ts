import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";
/** Role-level gate — the NestJS equivalent of an RLS `has_role(auth.uid(), '<role>')` clause. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

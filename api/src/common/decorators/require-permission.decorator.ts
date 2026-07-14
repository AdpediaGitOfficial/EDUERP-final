import { SetMetadata } from "@nestjs/common";

export const PERMISSION_KEY = "required_permission";

/**
 * Module-level permission gate (revoke model). The action is allowed unless an
 * admin has explicitly turned this permission OFF for the user in Staff Access
 * Control (a staff_permissions row with enabled=false). Admins always bypass.
 */
export const RequirePermission = (key: string) => SetMetadata(PERMISSION_KEY, key);

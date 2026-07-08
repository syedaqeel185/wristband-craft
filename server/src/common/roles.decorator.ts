import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Attach the roles allowed to access a route/controller. Enforced by RolesGuard.
 * Use together with an authentication guard (e.g. AuthGuard('jwt')) so that
 * `req.user.roles` is populated before RolesGuard runs.
 *
 * @example
 *   @UseGuards(AuthGuard('jwt'), RolesGuard)
 *   @Roles('admin')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

import { applyDecorators, SetMetadata } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Scope } from './scope';

export const SCOPE_KEY = 'auth:scope';
export const PUBLIC_KEY = 'auth:public';

/**
 * The scope an endpoint needs (ADR-0020). A key with this scope or a higher
 * one may call it. Also marks the endpoint for Swagger's Authorize button.
 */
export function RequireScope(scope: Scope) {
  return applyDecorators(
    SetMetadata(SCOPE_KEY, scope),
    ApiBearerAuth('bearer'),
    ApiUnauthorizedResponse({
      description:
        'No API key, or not a known one: Authorization: Bearer <key>',
    }),
    ApiForbiddenResponse({
      description: `The key's scope is too low: this endpoint needs ${scope}`,
    }),
  );
}

/** Open without a key. Without this or @RequireScope, the guard refuses the route. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

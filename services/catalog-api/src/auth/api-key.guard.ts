import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PUBLIC_KEY, SCOPE_KEY } from './auth.decorators';
import { type Scope, SCOPES, scopeAllows } from './scope';

const BEARER = /^bearer (\S+)$/i;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/**
 * The global guard (ADR-0020): every route needs @Public() or a key with the
 * scope its @RequireScope names. Keys are compared as SHA-256 digests with
 * timingSafeEqual: digests always have the same length (timingSafeEqual
 * throws otherwise), and all three are compared, so the time taken doesn't
 * reveal which key came close. Logs carry the scope, never the key.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);
  private readonly digests: [Scope, Buffer][];

  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.digests = SCOPES.map((scope) => [
      scope,
      sha256(config.apiKeys[scope]),
    ]);
  }

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) {
      return true;
    }
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const where = { method: req.method, path: req.path };

    const needs = this.reflector.getAllAndOverride<Scope | undefined>(
      SCOPE_KEY,
      targets,
    );
    if (!needs) {
      this.logger.error(
        'route has neither @RequireScope nor @Public; refused',
        where,
      );
      throw new ForbiddenException('this endpoint has no scope configured');
    }

    const has = this.scopeOf(req.headers.authorization);
    if (!has) {
      this.logger.warn('API key refused: missing or unknown', where);
      http.getResponse<Response>().setHeader('WWW-Authenticate', 'Bearer');
      throw new UnauthorizedException(
        'a valid API key is required: Authorization: Bearer <key>',
      );
    }
    if (!scopeAllows(has, needs)) {
      this.logger.warn('API key refused: scope too low', {
        ...where,
        needs,
        has,
      });
      throw new ForbiddenException(
        `this endpoint needs the ${needs} scope; your key has ${has}`,
      );
    }
    this.logger.debug('API key accepted', { ...where, scope: has });
    return true;
  }

  /** The scope of the key in an Authorization header, or undefined. */
  private scopeOf(header: string | undefined): Scope | undefined {
    const key = BEARER.exec(header ?? '')?.[1];
    if (!key) return undefined;
    const digest = sha256(key);
    let found: Scope | undefined;
    for (const [scope, expected] of this.digests) {
      if (timingSafeEqual(digest, expected)) found = scope;
    }
    return found;
  }
}

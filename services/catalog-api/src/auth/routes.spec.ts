import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PUBLIC_KEY, SCOPE_KEY } from './auth.decorators';

type Type = abstract new (...args: never[]) => unknown;

/** Every controller reachable from a module, through its imports. */
function controllersOf(module: unknown, seen = new Set<unknown>()): Type[] {
  const cls = (module as { module?: unknown }).module ?? module;
  if (!cls || seen.has(cls)) return [];
  seen.add(cls);
  const own = (Reflect.getMetadata('controllers', cls as object) ??
    []) as Type[];
  const imports = (Reflect.getMetadata('imports', cls as object) ??
    []) as unknown[];
  return [...own, ...imports.flatMap((m) => controllersOf(m, seen))];
}

const join = (...parts: string[]) =>
  '/' +
  parts
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

/** "METHOD /path" → its scope, "public", or "none". */
function routeAccess(): Record<string, string> {
  const reflector = new Reflector();
  const routes: Record<string, string> = {};
  for (const controller of controllersOf(AppModule)) {
    const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
    const proto = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as
        string | undefined;
      if (path === undefined) continue;
      const method =
        RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
      const targets = [handler, controller];
      const access = reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)
        ? 'public'
        : (reflector.getAllAndOverride<string>(SCOPE_KEY, targets) ?? 'none');
      routes[`${method} ${join(base, path)}`] = access;
    }
  }
  return routes;
}

// ADR-0020: a route with neither a scope nor @Public() is refused at runtime;
// this test makes it fail first, for every controller the app loads.
describe('route access', () => {
  it('gives every route the scope ADR-0020 assigns', () => {
    expect(routeAccess()).toEqual({
      'GET /products': 'read',
      'GET /products/search': 'read',
      'GET /products/:id': 'read',
      'POST /products': 'write',
      'PATCH /products/:id': 'write',
      'DELETE /products/:id': 'admin',
      'POST /admin/reindex': 'admin',
      'GET /healthz': 'public',
      'GET /readyz': 'public',
    });
  });
});

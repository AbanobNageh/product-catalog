/** API key scopes, lowest first: each includes the ones before it (ADR-0020). */
export const SCOPES = ['read', 'write', 'admin'] as const;

export type Scope = (typeof SCOPES)[number];

/** True when a key with scope `has` may call an endpoint that needs `needs`. */
export function scopeAllows(has: Scope, needs: Scope): boolean {
  return SCOPES.indexOf(has) >= SCOPES.indexOf(needs);
}

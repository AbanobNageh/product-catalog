import { apiKeyProblem } from '../config/api-key-format';

/** 20 bulk batches of 500, each up to 15s: generous, but bounded. */
const REINDEX_TIMEOUT_MS = 300_000;

export interface SeedEnv {
  databaseUrl: string;
  /** catalog-api's base URL, without a trailing slash. */
  apiUrl: string;
  /** The admin key: the seed calls POST /admin/reindex (ADR-0020). */
  apiKey: string;
}

/**
 * Reads the seed's environment, so every missing variable is reported before
 * anything is inserted. Errors name variables, never values.
 */
export function readSeedEnv(env: NodeJS.ProcessEnv): {
  config?: SeedEnv;
  errors: string[];
} {
  const errors: string[] = [];
  const databaseUrl = env.DATABASE_URL ?? '';
  if (!databaseUrl) errors.push('DATABASE_URL is required');
  const apiKey = env.CATALOG_API_KEY ?? '';
  if (!apiKey) {
    errors.push(
      'CATALOG_API_KEY is required: the admin API key (the seed calls POST /admin/reindex)',
    );
  } else {
    const problem = apiKeyProblem('CATALOG_API_KEY', apiKey);
    if (problem) errors.push(problem);
  }
  if (errors.length > 0) return { errors };
  const apiUrl = (env.CATALOG_API_URL || 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );
  return { config: { databaseUrl, apiUrl, apiKey }, errors };
}

export interface ReindexResult {
  indexed?: number;
  skipped?: number;
  failed?: unknown[];
  swapped?: boolean;
}

export type ReindexOutcome =
  | { ok: true; result: ReindexResult }
  | { ok: false; error: string; details: Record<string, unknown> };

/**
 * Asks catalog-api to reindex and judges the answer. Only a swap with no
 * failed items is a success. The key goes in the Authorization header and
 * nowhere else: the outcome is logged as is.
 */
export async function callReindex(
  apiUrl: string,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<ReindexOutcome> {
  const url = `${apiUrl}/admin/reindex`;
  let res: Response;
  let text: string;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(REINDEX_TIMEOUT_MS),
    });
    text = await res.text();
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } })
      .cause;
    return {
      ok: false,
      error: 'reindex request failed',
      details: { url, err: String(err), cause: cause?.code ?? cause?.message },
    };
  }
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep the raw text
  }
  if (res.status === 401) {
    return {
      ok: false,
      error:
        'reindex refused (401): CATALOG_API_KEY is not a valid API key; the seed needs the admin key',
      details: { url, body },
    };
  }
  if (res.status === 403) {
    return {
      ok: false,
      error:
        'reindex refused (403): CATALOG_API_KEY is not the admin key; the seed needs the admin scope',
      details: { url, body },
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: `reindex failed (${res.status})`,
      details: { url, body },
    };
  }
  const result = (
    typeof body === 'object' && body !== null ? body : {}
  ) as ReindexResult;
  if (result.failed && result.failed.length > 0) {
    return {
      ok: false,
      error: 'reindex finished with failed items',
      details: { ...result },
    };
  }
  if (result.swapped === false) {
    return { ok: false, error: 'reindex did not swap', details: { ...result } };
  }
  return { ok: true, result };
}

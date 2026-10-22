import { SearchUnavailableError } from './search.ports';

/**
 * search-service answered with a non-2xx, non-5xx status: a contract bug
 * between our two services, not an outage, so it is not a 503.
 */
export class SearchServiceError extends Error {
  override name = 'SearchServiceError';

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * One HTTP call to search-service. The timeout covers the response body too.
 * There are no retries (spec). Network errors, timeouts and 5xx become
 * SearchUnavailableError; any other non-2xx becomes SearchServiceError.
 * Returns the parsed JSON body, or undefined for 204.
 */
export async function callSearchService<T>(
  method: 'GET' | 'PUT' | 'DELETE' | 'POST',
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<T | undefined> {
  const call = `${method} ${new URL(url).pathname}`;
  // Serialised outside the try: a TypeError from JSON.stringify is our bug, not an outage.
  const json = body === undefined ? undefined : JSON.stringify(body);
  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      method,
      headers:
        json === undefined ? undefined : { 'content-type': 'application/json' },
      body: json,
      signal: AbortSignal.timeout(timeoutMs),
    });
    text = await res.text();
  } catch (err) {
    if (isNetworkOrTimeout(err)) {
      throw new SearchUnavailableError(
        `search-service ${call} failed: ${describe(err)}`,
      );
    }
    throw err;
  }

  if (res.status >= 500) {
    throw new SearchUnavailableError(
      `search-service ${call} returned ${res.status}`,
    );
  }
  if (!res.ok) {
    throw new SearchServiceError(
      res.status,
      `search-service ${call} returned ${res.status}: ${errorMessage(text)}`,
    );
  }
  if (res.status === 204 || text === '') return undefined;
  return JSON.parse(text) as T;
}

/**
 * fetch rejects with TypeError on network failure and a DOMException named
 * TimeoutError/AbortError on timeout. Matched by name, not instanceof: fetch's
 * errors come from Node's own realm, which isn't the caller's under Jest.
 */
function isNetworkOrTimeout(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return (
    name === 'TypeError' || name === 'TimeoutError' || name === 'AbortError'
  );
}

function describe(err: unknown): string {
  const { name, cause } = err as { name: string; cause?: { code?: string } };
  return cause?.code ?? name;
}

/** search-service error bodies are {"error": "..."}; fall back to the raw text. */
function errorMessage(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // not JSON
  }
  return text;
}

/** Long enough that a key can't be guessed (ADR-0020). */
export const MIN_API_KEY_LENGTH = 32;

/**
 * Visible ASCII only: what an `Authorization: Bearer <key>` header can carry.
 * A trailing newline (kubectl --from-file, PowerShell's Set-Content) or a
 * non-ASCII character would load fine, then match no request; and an invalid
 * header value is repeated in fetch's error, which the seed logs.
 */
const API_KEY_FORMAT = /^[\x21-\x7E]+$/;

/** What's wrong with an API key, naming only its variable; undefined if nothing. */
export function apiKeyProblem(name: string, key: string): string | undefined {
  if (!API_KEY_FORMAT.test(key)) {
    return `${name} must be printable ASCII without spaces`;
  }
  if (key.length < MIN_API_KEY_LENGTH) {
    return `${name} must be at least ${MIN_API_KEY_LENGTH} characters`;
  }
  return undefined;
}

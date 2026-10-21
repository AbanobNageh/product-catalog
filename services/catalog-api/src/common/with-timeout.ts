export class TimeoutError extends Error {
  override name = 'TimeoutError';
}

/**
 * Settles like `promise`, or rejects with TimeoutError after `ms`. The
 * underlying operation isn't cancelled; the caller just stops waiting for it.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

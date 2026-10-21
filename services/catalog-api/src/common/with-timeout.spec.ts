import { TimeoutError, withTimeout } from './with-timeout';

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 100)).resolves.toBe(42);
  });

  it('passes through a rejection', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 100),
    ).rejects.toThrow('boom');
  });

  it('rejects with TimeoutError when the promise never settles', async () => {
    const result = withTimeout(new Promise(() => {}), 100).catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(100);
    const error = await result;
    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as Error).message).toBe('timed out after 100ms');
  });

  it('clears its timer once the promise settles', async () => {
    await withTimeout(Promise.resolve(1), 100);
    expect(jest.getTimerCount()).toBe(0);
  });
});

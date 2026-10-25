import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IntQueryParam } from './int-query-param';

class Query {
  @IntQueryParam({ min: 0, max: 2147483647 })
  n?: number;

  @IntQueryParam({ min: 1, max: 100, default: 20 })
  size: number = 20;
}

const parse = (query: Record<string, string>) => plainToInstance(Query, query);

const messages = async (query: Record<string, string>) =>
  (await validate(parse(query))).flatMap((e) =>
    Object.values(e.constraints ?? {}),
  );

describe('IntQueryParam', () => {
  // The 5.1 review: one bad value used to get three messages, one of them
  // "must not be greater than 2147483647" for -1.
  it.each(['-1', 'abc', '1.5', '1e3', '0x10', '2147483648'])(
    'gives %p exactly one message',
    async (n) => {
      await expect(messages({ n })).resolves.toEqual([
        'n must be a whole number from 0 to 2147483647',
      ]);
    },
  );

  it('treats blank as unset', async () => {
    for (const n of ['', ' ']) {
      expect(parse({ n }).n).toBeUndefined();
      await expect(messages({ n })).resolves.toEqual([]);
    }
  });

  it('keeps 0, and both ends of the range', async () => {
    expect(parse({ n: '0' }).n).toBe(0);
    expect(parse({ n: '2147483647' }).n).toBe(2147483647);
    await expect(messages({ n: '0' })).resolves.toEqual([]);
  });

  it('uses the default when missing or blank', async () => {
    expect(parse({}).size).toBe(20);
    expect(parse({ size: ' ' }).size).toBe(20);
    await expect(messages({ size: '' })).resolves.toEqual([]);
  });

  it('checks the range of a defaulted parameter', async () => {
    await expect(messages({ size: '101' })).resolves.toEqual([
      'size must be a whole number from 1 to 100',
    ]);
  });
});

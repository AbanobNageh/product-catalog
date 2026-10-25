import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchProductsQuery } from './search-products.query';

const parse = (query: Record<string, string>) =>
  plainToInstance(SearchProductsQuery, query);

const invalid = async (query: Record<string, string>) =>
  (await validate(parse(query))).map((e) => e.property);

describe('SearchProductsQuery', () => {
  it('defaults to relevance, page 1, size 20', async () => {
    const q = parse({});
    expect(q).toMatchObject({ sort: 'relevance', page: 1, size: 20 });
    await expect(validate(q)).resolves.toEqual([]);
  });

  it('converts query strings to numbers and booleans', () => {
    expect(
      parse({ minPrice: '10000', maxPrice: '50000', inStock: 'true', page: '2' }),
    ).toMatchObject({ minPrice: 10000, maxPrice: 50000, inStock: true, page: 2 });
    expect(parse({ inStock: 'false' })).toMatchObject({ inStock: false });
    expect(parse({ maxStock: '5', sort: 'stock_asc' })).toMatchObject({
      maxStock: 5,
      sort: 'stock_asc',
    });
  });

  // 0 is a real filter (out of stock only), not "unset".
  it('keeps maxStock 0', async () => {
    const q = parse({ maxStock: '0' });
    expect(q.maxStock).toBe(0);
    await expect(validate(q)).resolves.toEqual([]);
  });

  // Review M3: `?maxPrice=` used to become 0 and silently filter to free products.
  it('treats an empty price parameter as unset', async () => {
    const q = parse({ maxPrice: '', minPrice: ' ' });
    expect(q.maxPrice).toBeUndefined();
    expect(q.minPrice).toBeUndefined();
    await expect(validate(q)).resolves.toEqual([]);
  });

  it('treats an empty maxStock as unset', async () => {
    for (const maxStock of ['', ' ']) {
      const q = parse({ maxStock });
      expect(q.maxStock).toBeUndefined();
      await expect(validate(q)).resolves.toEqual([]);
    }
  });

  it.each([
    ['a minPrice in exponent form', { minPrice: '1e3' }, 'minPrice'],
    ['a hex maxPrice', { maxPrice: '0x10' }, 'maxPrice'],
    ['a minPrice above the int4 maximum', { minPrice: '2147483648' }, 'minPrice'],
    ['an unknown sort', { sort: 'cheapest' }, 'sort'],
    ['inStock other than true/false', { inStock: 'yes' }, 'inStock'],
    ['a negative minPrice', { minPrice: '-1' }, 'minPrice'],
    ['a fractional maxPrice', { maxPrice: '10.5' }, 'maxPrice'],
    ['size above 100', { size: '101' }, 'size'],
    ['page 0', { page: '0' }, 'page'],
    ['a negative maxStock', { maxStock: '-1' }, 'maxStock'],
    ['a non-numeric maxStock', { maxStock: 'abc' }, 'maxStock'],
    ['a maxStock above the int4 maximum', { maxStock: '2147483648' }, 'maxStock'],
    ['a fractional maxStock', { maxStock: '1.5' }, 'maxStock'],
  ])('rejects %s', async (_, query, property) => {
    await expect(invalid(query)).resolves.toEqual([property]);
  });

  // The 5.1 review: one message per bad integer, in search-service's words.
  it.each([
    [{ minPrice: '-1' }, 'minPrice must be a whole number from 0 to 2147483647'],
    [{ maxStock: 'abc' }, 'maxStock must be a whole number from 0 to 2147483647'],
    [{ page: 'abc' }, 'page must be a whole number from 1 to 2147483647'],
    [{ size: '0' }, 'size must be a whole number from 1 to 100'],
  ])('gives %p a single message', async (query, message) => {
    const errors = await validate(parse(query));
    expect(errors.flatMap((e) => Object.values(e.constraints ?? {}))).toEqual([message]);
  });

  // The same limits search-service enforces, so users get catalog-api's own 400.
  describe('limits shared with search-service', () => {
    it.each([
      ['q of 200 characters', { q: 'a'.repeat(200) }],
      ['page × size of exactly 10000', { page: '500', size: '20' }],
      ['minPrice equal to maxPrice', { minPrice: '100', maxPrice: '100' }],
      ['minPrice without maxPrice', { minPrice: '500' }],
    ])('accepts %s', async (_, query) => {
      await expect(invalid(query)).resolves.toEqual([]);
    });

    it.each([
      ['q of 201 characters', { q: 'a'.repeat(201) }, 'q'],
      ['page × size over 10000 (501 × 20)', { page: '501', size: '20' }, 'page'],
      ['page × size over 10000 (101 × 100)', { page: '101', size: '100' }, 'page'],
      ['minPrice above maxPrice', { minPrice: '500', maxPrice: '100' }, 'maxPrice'],
    ])('rejects %s', async (_, query, property) => {
      await expect(invalid(query)).resolves.toEqual([property]);
    });

    it('reports an invalid page once, without a window error on top', async () => {
      const errors = await validate(parse({ page: 'abc' }));
      expect(errors.map((e) => e.property)).toEqual(['page']);
      expect(Object.values(errors[0].constraints ?? {})).not.toContain(
        'page × size must be at most 10000',
      );
    });

    it('explains the window and price-range errors', async () => {
      const [window] = await validate(parse({ page: '501', size: '20' }));
      expect(Object.values(window.constraints ?? {})).toEqual([
        'page × size must be at most 10000',
      ]);
      const [range] = await validate(parse({ minPrice: '500', maxPrice: '100' }));
      expect(Object.values(range.constraints ?? {})).toEqual([
        'maxPrice must not be less than minPrice',
      ]);
    });
  });
});

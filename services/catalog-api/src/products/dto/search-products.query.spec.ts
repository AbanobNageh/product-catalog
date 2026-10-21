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
  });

  // Review M3: `?maxPrice=` used to become 0 and silently filter to free products.
  it('treats an empty price parameter as unset', async () => {
    const q = parse({ maxPrice: '', minPrice: ' ' });
    expect(q.maxPrice).toBeUndefined();
    expect(q.minPrice).toBeUndefined();
    await expect(validate(q)).resolves.toEqual([]);
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
  ])('rejects %s', async (_, query, property) => {
    await expect(invalid(query)).resolves.toEqual([property]);
  });
});

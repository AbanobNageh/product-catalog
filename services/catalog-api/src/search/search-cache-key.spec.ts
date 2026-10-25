import type { SearchQuery } from './search.ports';
import { searchCacheKey } from './search-cache-key';

const base: SearchQuery = { sort: 'relevance', page: 1, size: 20 };

describe('searchCacheKey', () => {
  it('ignores the order of the query fields', () => {
    const a: SearchQuery = { ...base, q: 'phone', category: 'electronics' };
    const b: SearchQuery = {
      category: 'electronics',
      size: 20,
      q: 'phone',
      page: 1,
      sort: 'relevance',
    };
    expect(searchCacheKey(a, 1)).toBe(searchCacheKey(b, 1));
  });

  it('normalises q case and surrounding whitespace', () => {
    expect(searchCacheKey({ ...base, q: '  Phone ' }, 1)).toBe(
      searchCacheKey({ ...base, q: 'phone' }, 1),
    );
  });

  it('omits undefined and empty fields', () => {
    expect(searchCacheKey({ ...base, brand: undefined, q: '  ' }, 1)).toBe(
      searchCacheKey(base, 1),
    );
  });

  it('keeps false and 0 values', () => {
    expect(searchCacheKey({ ...base, inStock: false }, 1)).not.toBe(
      searchCacheKey(base, 1),
    );
    expect(searchCacheKey({ ...base, minPrice: 0 }, 1)).not.toBe(
      searchCacheKey(base, 1),
    );
  });

  it('separates queries that differ only in maxStock, including 0', () => {
    const keys = [base, { ...base, maxStock: 5 }, { ...base, maxStock: 0 }].map(
      (q) => searchCacheKey(q, 1),
    );
    expect(new Set(keys).size).toBe(3);
  });

  it('gives different pages different keys', () => {
    expect(searchCacheKey({ ...base, page: 2 }, 1)).not.toBe(
      searchCacheKey(base, 1),
    );
  });

  it('puts the version in the key so a write orphans old entries', () => {
    expect(searchCacheKey(base, 3)).not.toBe(searchCacheKey(base, 4));
    expect(searchCacheKey(base, 3)).toMatch(/^search:v3:/);
  });
});

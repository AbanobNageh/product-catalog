import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from '../products/dto/create-product.dto';
import { generateProducts, SEED_CATEGORIES } from './generate-products';

describe('generateProducts', () => {
  // One run of the real size, shared: generation is pure.
  const products = generateProducts(10_000, 2026);

  it('makes the requested number of products with unique, padded SEED skus', () => {
    expect(products).toHaveLength(10_000);
    expect(new Set(products.map((p) => p.sku)).size).toBe(10_000);
    expect(products.every((p) => /^SEED-\d{5}$/.test(p.sku))).toBe(true);
    expect(products[0].sku).toBe('SEED-00001');
    expect(products[9_999].sku).toBe('SEED-10000');
  });

  it('is deterministic for a seed, and differs between seeds', () => {
    expect(generateProducts(50, 2026)).toEqual(products.slice(0, 50));
    expect(generateProducts(50, 7)).not.toEqual(products.slice(0, 50));
  });

  it('uses all 10 categories and exactly 30 brands', () => {
    expect(SEED_CATEGORIES).toHaveLength(10);
    expect(SEED_CATEGORIES).toEqual(
      expect.arrayContaining(['electronics', 'books']),
    );
    expect(new Set(products.map((p) => p.category))).toEqual(
      new Set(SEED_CATEGORIES),
    );
    expect(new Set(products.map((p) => p.brand)).size).toBe(30);
  });

  it('has some out-of-stock products, so the inStock filter matters', () => {
    expect(products.every((p) => p.stock >= 0)).toBe(true);
    const share =
      products.filter((p) => p.stock === 0).length / products.length;
    expect(share).toBeGreaterThanOrEqual(0.05);
    expect(share).toBeLessThanOrEqual(0.2);
  });

  // search-service's price buckets (cents): every facet bucket gets data.
  it.each([
    ['under 100 EGP', 0, 10_000],
    ['100–500 EGP', 10_000, 50_000],
    ['500–2,000 EGP', 50_000, 200_000],
    ['2,000–10,000 EGP', 200_000, 1_000_000],
    ['10,000+ EGP', 1_000_000, Infinity],
  ])('puts at least 100 products in the %s bucket', (_, from, to) => {
    const inBucket = products.filter(
      (p) => p.priceCents >= from && p.priceCents < to,
    );
    expect(inBucket.length).toBeGreaterThanOrEqual(100);
  });

  // The 1.4 Done-when query: q=phone&category=electronics&minPrice=10000.
  it('has in-stock electronics phones of at least 10000 cents', () => {
    const phones = products.filter(
      (p) =>
        p.category === 'electronics' &&
        p.name.includes('Phone') &&
        p.priceCents >= 10_000 &&
        p.stock > 0,
    );
    expect(phones.length).toBeGreaterThanOrEqual(20);
  });

  it('dates products within the year before 2026-10-01, updatedAt = createdAt', () => {
    const ref = Date.parse('2026-10-01T00:00:00Z');
    for (const p of products) {
      const created = new Date(p.createdAt as Date).getTime();
      expect(created).toBeLessThanOrEqual(ref);
      expect(created).toBeGreaterThanOrEqual(ref - 365 * 24 * 3600 * 1000);
      expect(p.updatedAt).toEqual(p.createdAt);
    }
  });

  it('makes products the API itself would accept', async () => {
    for (const { createdAt: _c, updatedAt: _u, ...body } of products.slice(
      0,
      100,
    )) {
      await expect(
        validate(plainToInstance(CreateProductDto, body)),
      ).resolves.toEqual([]);
    }
  });
});

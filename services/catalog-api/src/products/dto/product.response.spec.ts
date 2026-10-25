import { toProductResponse } from './product.response';

describe('toProductResponse', () => {
  it('copies the fields and serialises dates as ISO strings', () => {
    const createdAt = new Date('2026-10-21T10:00:00.000Z');
    const updatedAt = new Date('2026-10-21T11:00:00.000Z');
    expect(
      toProductResponse({
        id: '0b8f6a52-6a8e-4b8e-9d55-2f1f3c1d9e01',
        sku: 'SKU-1',
        name: 'Phone',
        description: 'A phone',
        category: 'electronics',
        brand: 'Acme',
        priceCents: 1999900,
        currency: 'EGP',
        stock: 3,
        createdAt,
        updatedAt,
        version: 4,
      }),
    ).toEqual({
      id: '0b8f6a52-6a8e-4b8e-9d55-2f1f3c1d9e01',
      sku: 'SKU-1',
      name: 'Phone',
      description: 'A phone',
      category: 'electronics',
      brand: 'Acme',
      priceCents: 1999900,
      currency: 'EGP',
      stock: 3,
      createdAt: '2026-10-21T10:00:00.000Z',
      updatedAt: '2026-10-21T11:00:00.000Z',
      version: 4,
    });
  });
});

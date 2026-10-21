import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { ListProductsQuery } from './list-products.query';
import { UpdateProductDto } from './update-product.dto';

const valid = {
  sku: 'SKU-1',
  name: 'Phone',
  description: 'A phone',
  category: 'electronics',
  brand: 'Acme',
  priceCents: 1999900,
  stock: 3,
};

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(CreateProductDto, body));
  return errors.map((e) => e.property);
}

describe('CreateProductDto', () => {
  it('accepts a valid body, with or without currency', async () => {
    await expect(errorsFor(valid)).resolves.toEqual([]);
    await expect(errorsFor({ ...valid, currency: 'USD' })).resolves.toEqual([]);
  });

  it.each([
    ['negative stock', { stock: -1 }, 'stock'],
    ['fractional price', { priceCents: 19.99 }, 'priceCents'],
    ['negative price', { priceCents: -5 }, 'priceCents'],
    ['price as a string', { priceCents: '100' }, 'priceCents'],
    ['empty sku', { sku: '' }, 'sku'],
    ['lowercase currency', { currency: 'egp' }, 'currency'],
    ['4-letter currency', { currency: 'EGPP' }, 'currency'],
  ])('rejects %s', async (_, override, property) => {
    await expect(errorsFor({ ...valid, ...override })).resolves.toEqual([
      property,
    ]);
  });

  it('rejects a missing sku', async () => {
    const { sku: _, ...body } = valid;
    await expect(errorsFor(body)).resolves.toEqual(['sku']);
  });

  // Review I1: @IsOptional() also skips null, which then reached Prisma as a 500.
  it('rejects a null currency', async () => {
    await expect(errorsFor({ ...valid, currency: null })).resolves.toEqual([
      'currency',
    ]);
  });

  // Review I2: values above Postgres int4 used to pass and fail in the DB as a 500.
  it.each([
    ['priceCents', { priceCents: 2_147_483_648 }],
    ['stock', { stock: 2_147_483_648 }],
  ])('rejects %s above the int4 maximum', async (property, override) => {
    await expect(errorsFor({ ...valid, ...override })).resolves.toEqual([
      property,
    ]);
  });

  it('accepts the int4 maximum', async () => {
    await expect(
      errorsFor({ ...valid, priceCents: 2_147_483_647, stock: 2_147_483_647 }),
    ).resolves.toEqual([]);
  });
});

describe('UpdateProductDto', () => {
  const errorsForUpdate = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(UpdateProductDto, body))).map(
      (e) => e.property,
    );

  it('accepts a partial body', async () => {
    await expect(errorsForUpdate({ stock: 5 })).resolves.toEqual([]);
  });

  it.each(['name', 'priceCents', 'stock', 'currency'])(
    'rejects %s: null',
    async (property) => {
      await expect(errorsForUpdate({ [property]: null })).resolves.toEqual([
        property,
      ]);
    },
  );
});

describe('ListProductsQuery', () => {
  const parse = (query: Record<string, string>) =>
    plainToInstance(ListProductsQuery, query);

  it('defaults to page 1, limit 20', async () => {
    const q = parse({});
    expect(q).toMatchObject({ page: 1, limit: 20 });
    await expect(validate(q)).resolves.toEqual([]);
  });

  it('converts query strings to numbers', () => {
    expect(parse({ page: '3', limit: '50' })).toMatchObject({ page: 3, limit: 50 });
  });

  it('rejects limit above 100 and page below 1', async () => {
    const errors = await validate(parse({ page: '0', limit: '101' }));
    expect(errors.map((e) => e.property).sort()).toEqual(['limit', 'page']);
  });
});

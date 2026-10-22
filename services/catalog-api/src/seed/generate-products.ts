import { base, en, Faker } from '@faker-js/faker';
import type { Prisma } from '../generated/prisma/client';

interface CategorySpec {
  nouns: readonly string[];
  /** Price range in cents; prices are spread log-uniformly across it. */
  minCents: number;
  maxCents: number;
}

/**
 * Category-specific nouns, so names read like real products and `q=phone`
 * finds phones. The price ranges together fill every search-service price
 * bucket (under 100 EGP up to 10,000+ EGP).
 */
const CATALOG: Record<string, CategorySpec> = {
  electronics: {
    nouns: [
      'Phone',
      'Smartphone',
      'Laptop',
      'Tablet',
      'Headphones',
      'Smartwatch',
      'Camera',
      'Speaker',
      'Monitor',
    ],
    minCents: 5_000,
    maxCents: 8_000_000,
  },
  books: {
    nouns: [
      'Novel',
      'Cookbook',
      'Biography',
      'Atlas',
      'Textbook',
      'Comic',
      'Poetry Collection',
    ],
    minCents: 3_000,
    maxCents: 150_000,
  },
  home: {
    nouns: [
      'Lamp',
      'Rug',
      'Curtain',
      'Wall Clock',
      'Mirror',
      'Vase',
      'Cushion',
    ],
    minCents: 5_000,
    maxCents: 1_500_000,
  },
  kitchen: {
    nouns: [
      'Blender',
      'Kettle',
      'Toaster',
      'Frying Pan',
      'Knife Set',
      'Coffee Maker',
      'Mixer',
    ],
    minCents: 5_000,
    maxCents: 2_500_000,
  },
  sports: {
    nouns: [
      'Football',
      'Yoga Mat',
      'Dumbbell',
      'Bicycle',
      'Racket',
      'Treadmill',
      'Helmet',
    ],
    minCents: 5_000,
    maxCents: 5_000_000,
  },
  toys: {
    nouns: [
      'Puzzle',
      'Robot',
      'Doll',
      'Building Set',
      'Board Game',
      'Drone',
      'Toy Car',
    ],
    minCents: 2_000,
    maxCents: 800_000,
  },
  beauty: {
    nouns: [
      'Perfume',
      'Face Cream',
      'Shampoo',
      'Lipstick',
      'Hair Dryer',
      'Serum',
    ],
    minCents: 2_000,
    maxCents: 600_000,
  },
  fashion: {
    nouns: [
      'Jacket',
      'Sneakers',
      'Wristwatch',
      'Handbag',
      'Sunglasses',
      'Dress',
      'Shirt',
    ],
    minCents: 5_000,
    maxCents: 3_000_000,
  },
  garden: {
    nouns: ['Hose', 'Planter', 'Lawn Mower', 'Shovel', 'Grill', 'Garden Chair'],
    minCents: 3_000,
    maxCents: 2_000_000,
  },
  automotive: {
    nouns: [
      'Car Charger',
      'Dash Cam',
      'Tire Inflator',
      'Seat Cover',
      'Jump Starter',
      'Floor Mat',
    ],
    minCents: 5_000,
    maxCents: 1_200_000,
  },
};

export const SEED_CATEGORIES: readonly string[] = Object.keys(CATALOG);

const BRAND_COUNT = 30;
const OUT_OF_STOCK_SHARE = 0.1;
/** Fixed, so the same seed always gives the same dates. */
const REFERENCE_DATE = new Date('2026-10-01T00:00:00Z');
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * `count` fake products, the same every time for the same `seed`. Pure: it
 * uses its own Faker instance, never the global one. SKUs are SEED-00001,
 * SEED-00002, ..., so re-inserting them is idempotent.
 */
export function generateProducts(
  count: number,
  seed: number,
): Prisma.ProductCreateManyInput[] {
  const f = new Faker({ locale: [en, base] });
  f.seed(seed);

  const brands = new Set<string>();
  while (brands.size < BRAND_COUNT) {
    // "Kuhn, Schmidt and Hahn" → "Kuhn": short enough to lead a product name.
    brands.add(f.company.name().split(/[\s,-]+/)[0]);
  }
  const brandList = [...brands];

  return Array.from({ length: count }, (_, i) => {
    const category = f.helpers.arrayElement(SEED_CATEGORIES);
    const spec = CATALOG[category];
    const brand = f.helpers.arrayElement(brandList);
    const noun = f.helpers.arrayElement(spec.nouns);
    const logPrice = f.number.float({
      min: Math.log(spec.minCents),
      max: Math.log(spec.maxCents),
    });
    const createdAt = f.date.between({
      from: REFERENCE_DATE.getTime() - YEAR_MS,
      to: REFERENCE_DATE,
    });
    return {
      sku: `SEED-${String(i + 1).padStart(5, '0')}`,
      name: `${brand} ${f.commerce.productAdjective()} ${noun} ${f.number.int({ min: 1, max: 20 })}`,
      description: f.commerce.productDescription(),
      category,
      brand,
      // Whole pounds, which look like real prices.
      priceCents: Math.max(
        spec.minCents,
        Math.round(Math.exp(logPrice) / 100) * 100,
      ),
      stock: f.datatype.boolean({ probability: OUT_OF_STOCK_SHARE })
        ? 0
        : f.number.int({ min: 1, max: 200 }),
      createdAt,
      updatedAt: createdAt,
    };
  });
}

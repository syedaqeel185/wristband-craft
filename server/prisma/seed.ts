import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Idempotent seed: reference countries, the default `starter` plan, and a
 * TRIALING subscription backfill for any supplier that does not yet have one.
 * Safe to run repeatedly. Run with: `npx ts-node prisma/seed.ts`.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ISO-3166 alpha-2 subset covering all regions; expand freely — upserts are safe.
const COUNTRIES: Array<[string, string, string, string?]> = [
  ['AE', 'United Arab Emirates', 'Asia', 'AED'],
  ['AR', 'Argentina', 'Americas', 'ARS'],
  ['AT', 'Austria', 'Europe', 'EUR'],
  ['AU', 'Australia', 'Oceania', 'AUD'],
  ['BD', 'Bangladesh', 'Asia', 'BDT'],
  ['BE', 'Belgium', 'Europe', 'EUR'],
  ['BG', 'Bulgaria', 'Europe', 'BGN'],
  ['BR', 'Brazil', 'Americas', 'BRL'],
  ['CA', 'Canada', 'Americas', 'CAD'],
  ['CH', 'Switzerland', 'Europe', 'CHF'],
  ['CL', 'Chile', 'Americas', 'CLP'],
  ['CN', 'China', 'Asia', 'CNY'],
  ['CO', 'Colombia', 'Americas', 'COP'],
  ['CZ', 'Czechia', 'Europe', 'CZK'],
  ['DE', 'Germany', 'Europe', 'EUR'],
  ['DK', 'Denmark', 'Europe', 'DKK'],
  ['EE', 'Estonia', 'Europe', 'EUR'],
  ['EG', 'Egypt', 'Africa', 'EGP'],
  ['ES', 'Spain', 'Europe', 'EUR'],
  ['FI', 'Finland', 'Europe', 'EUR'],
  ['FR', 'France', 'Europe', 'EUR'],
  ['GB', 'United Kingdom', 'Europe', 'GBP'],
  ['GR', 'Greece', 'Europe', 'EUR'],
  ['HR', 'Croatia', 'Europe', 'EUR'],
  ['HU', 'Hungary', 'Europe', 'HUF'],
  ['ID', 'Indonesia', 'Asia', 'IDR'],
  ['IE', 'Ireland', 'Europe', 'EUR'],
  ['IL', 'Israel', 'Asia', 'ILS'],
  ['IN', 'India', 'Asia', 'INR'],
  ['IT', 'Italy', 'Europe', 'EUR'],
  ['JP', 'Japan', 'Asia', 'JPY'],
  ['KE', 'Kenya', 'Africa', 'KES'],
  ['KR', 'South Korea', 'Asia', 'KRW'],
  ['LK', 'Sri Lanka', 'Asia', 'LKR'],
  ['LT', 'Lithuania', 'Europe', 'EUR'],
  ['LU', 'Luxembourg', 'Europe', 'EUR'],
  ['LV', 'Latvia', 'Europe', 'EUR'],
  ['MA', 'Morocco', 'Africa', 'MAD'],
  ['MX', 'Mexico', 'Americas', 'MXN'],
  ['MY', 'Malaysia', 'Asia', 'MYR'],
  ['NG', 'Nigeria', 'Africa', 'NGN'],
  ['NL', 'Netherlands', 'Europe', 'EUR'],
  ['NO', 'Norway', 'Europe', 'NOK'],
  ['NZ', 'New Zealand', 'Oceania', 'NZD'],
  ['PH', 'Philippines', 'Asia', 'PHP'],
  ['PK', 'Pakistan', 'Asia', 'PKR'],
  ['PL', 'Poland', 'Europe', 'PLN'],
  ['PT', 'Portugal', 'Europe', 'EUR'],
  ['RO', 'Romania', 'Europe', 'RON'],
  ['SA', 'Saudi Arabia', 'Asia', 'SAR'],
  ['SE', 'Sweden', 'Europe', 'SEK'],
  ['SG', 'Singapore', 'Asia', 'SGD'],
  ['SI', 'Slovenia', 'Europe', 'EUR'],
  ['SK', 'Slovakia', 'Europe', 'EUR'],
  ['TH', 'Thailand', 'Asia', 'THB'],
  ['TR', 'Türkiye', 'Asia', 'TRY'],
  ['UA', 'Ukraine', 'Europe', 'UAH'],
  ['US', 'United States', 'Americas', 'USD'],
  ['VN', 'Vietnam', 'Asia', 'VND'],
  ['ZA', 'South Africa', 'Africa', 'ZAR'],
];

async function seedCountries() {
  for (const [code, name, region, currency] of COUNTRIES) {
    await prisma.country.upsert({
      where: { code },
      update: { name, region, currency },
      create: { code, name, region, currency },
    });
  }
  console.log(`Countries seeded: ${COUNTRIES.length}`);
}

async function seedStarterPlan() {
  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: 'starter' },
    update: {},
    create: {
      code: 'starter',
      name: 'Starter',
      description: 'Everything you need to sell on the platform.',
      priceUsd: 29,
      priceEur: 29,
      priceGbp: 25,
      interval: 'month',
      trialDays: 30,
      isActive: true,
      featuresJson: JSON.stringify([
        'Unlimited products',
        'Order management',
        'Own payment methods',
        'Customer reviews',
      ]),
    },
  });
  console.log(`Starter plan ready: ${plan.id}`);
  return plan;
}

async function backfillTrials(planId: string, trialDays: number) {
  const suppliers = await prisma.supplier.findMany({
    where: { subscription: { is: null } },
    select: { id: true },
  });
  const now = new Date();
  const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
  for (const s of suppliers) {
    await prisma.subscription.create({
      data: {
        supplierId: s.id,
        planId,
        status: 'TRIALING',
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        trialEndsAt: trialEnd,
      },
    });
  }
  console.log(`Backfilled trials for ${suppliers.length} supplier(s).`);
}

async function main() {
  await seedCountries();
  const plan = await seedStarterPlan();
  await backfillTrials(plan.id, plan.trialDays);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

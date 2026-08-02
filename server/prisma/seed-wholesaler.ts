import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

/**
 * Seed the platform's EU house wholesaler (European Promotion) and its real
 * Tyvek DuPont event-wristband catalogue, taken from the dealer price list:
 *  - two sizes (19×225 mm, 25×225 mm) as separate products
 *  - quantity tiers = the unprinted (solid-colour) price per unit
 *  - Black print (+€0.01/unit) and Full-colour CMYK (+€0.03/unit) options
 *  - extra services: QR Code Serial ID (+€0.02/unit), RFID Sticker (+€0.29/unit)
 *  - the 18 solid colours + the 225 mm length
 *
 * Idempotent: re-running updates prices/options in place and never duplicates.
 * Run with: `npx ts-node prisma/seed-wholesaler.ts`
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/** The 18 solid colours from the dealer price list (name + display swatch). */
export const TYVEK_COLORS = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Black', value: '#0A0A0A' },
  { name: 'Silver', value: '#C0C0C0' },
  { name: 'Yellow', value: '#FFE800' },
  { name: 'Neon Yellow', value: '#E1FF00' },
  { name: 'Gold', value: '#D4AF37' },
  { name: 'Red', value: '#E4002B' },
  { name: 'Neon Red', value: '#FF3B3B' },
  { name: 'Neon Orange', value: '#FF6A13' },
  { name: 'Neon Green', value: '#4CFF4C' },
  { name: 'Green', value: '#3EA34B' },
  { name: 'Sky Blue', value: '#7FC7E8' },
  { name: 'Neon Blue', value: '#2E6BFF' },
  { name: 'Dark Blue', value: '#16307A' },
  { name: 'Aqua', value: '#37C4C4' },
  { name: 'Lavender', value: '#B57EDC' },
  { name: 'Neon Pink', value: '#FF4FC3' },
  { name: 'Purple', value: '#7B2FA0' },
];

type Tier = { minQuantity: number; maxQuantity: number | null; price: number };

const TIERS_19MM: Tier[] = [
  { minQuantity: 500, maxQuantity: 2000, price: 0.029 },
  { minQuantity: 2001, maxQuantity: 5000, price: 0.027 },
  { minQuantity: 5001, maxQuantity: 10000, price: 0.025 },
  { minQuantity: 10001, maxQuantity: null, price: 0.023 },
];

const TIERS_25MM: Tier[] = [
  { minQuantity: 500, maxQuantity: 2000, price: 0.036 },
  { minQuantity: 2001, maxQuantity: 5000, price: 0.035 },
  { minQuantity: 5001, maxQuantity: 10000, price: 0.034 },
  { minQuantity: 10001, maxQuantity: null, price: 0.033 },
];

/** The customization options every Tyvek product offers (dealer price list). */
function tyvekOptions() {
  return [
    {
      key: 'black_print',
      label: 'Black print (1 colour)',
      description: 'Single-colour black print of your text or artwork',
      groupName: 'Print',
      pricingMode: 'per_unit',
      priceUsd: 0.01,
      priceEur: 0.01,
      priceGbp: null,
      isActive: true,
      sortOrder: 0,
      studioModule: 'print',
      choicesJson: null,
    },
    {
      key: 'full_color_print',
      label: 'Full-colour print (CMYK)',
      description: 'Full-colour CMYK print of your design',
      groupName: 'Print',
      pricingMode: 'per_unit',
      priceUsd: 0.03,
      priceEur: 0.03,
      priceGbp: null,
      isActive: true,
      sortOrder: 1,
      studioModule: 'print',
      choicesJson: null,
    },
    {
      key: 'qr_code',
      label: 'QR Code Serial ID',
      description: 'Unique QR code with a serial number for easy check-in and access control',
      groupName: 'Extra services',
      pricingMode: 'per_unit',
      priceUsd: 0.02,
      priceEur: 0.02,
      priceGbp: null,
      isActive: true,
      sortOrder: 2,
      studioModule: 'qr',
      choicesJson: null,
    },
    {
      key: 'rfid_sticker',
      label: 'RFID Sticker (Mifare / F08 / 1K)',
      description: 'Contactless RFID technology for access control, payments and tracking',
      groupName: 'Extra services',
      pricingMode: 'per_unit',
      priceUsd: 0.29,
      priceEur: 0.29,
      priceGbp: null,
      isActive: true,
      sortOrder: 3,
      studioModule: 'toggle',
      choicesJson: null,
    },
  ];
}

async function upsertTyvekProduct(
  supplierId: string,
  opts: { name: string; size: string; tiers: Tier[]; sortOrder: number },
) {
  const description =
    'TYVEK® DuPont event wristband — waterproof, comfortable and eco-friendly. ' +
    `${opts.size}. Prices in EUR per unit (EXW), VAT not included.`;
  const options = tyvekOptions();

  // Legacy column mirror so anything still reading the old columns matches.
  const legacy = {
    printExtraUsd: 0.01,
    colorPrintExtraUsd: 0.03,
    qrCodePriceUsd: 0.02,
    qrCodePriceEur: 0.02,
  };

  const existing = await prisma.product.findFirst({
    where: { supplierId, name: opts.name },
  });

  const base = {
    supplierId,
    name: opts.name,
    description,
    wristbandType: 'tyvek',
    priceUsd: opts.tiers[0].price,
    priceEur: opts.tiers[0].price,
    minOrderQuantity: opts.tiers[0].minQuantity,
    isActive: true,
    sortOrder: opts.sortOrder,
    availableSizes: JSON.stringify([opts.size]),
    availableColors: JSON.stringify(TYVEK_COLORS),
    ...legacy,
  };

  const productId = existing
    ? (await prisma.product.update({ where: { id: existing.id }, data: base })).id
    : (await prisma.product.create({ data: base })).id;

  // Replace tiers + options so re-running always reflects the price list.
  await prisma.supplierPricingTier.deleteMany({ where: { productId } });
  await prisma.supplierPricingTier.createMany({
    data: opts.tiers.map((t) => ({
      productId,
      minQuantity: t.minQuantity,
      maxQuantity: t.maxQuantity,
      pricePerUnitUsd: t.price,
      pricePerUnitEur: t.price,
    })),
  });

  await prisma.productOption.deleteMany({ where: { productId } });
  await prisma.productOption.createMany({
    data: options.map((o) => ({ ...o, productId })),
  });

  return productId;
}

async function main() {
  const email = (process.env.HOUSE_WHOLESALER_EMAIL || 'wholesale@euwristbands.com').toLowerCase();
  const providedPassword = process.env.HOUSE_WHOLESALER_PASSWORD;
  const password = providedPassword || `EUW-${randomBytes(6).toString('hex')}`;

  // 1) Account (Profile + supplier role).
  const existingProfile = await prisma.profile.findUnique({ where: { email } });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = existingProfile
    ? existingProfile
    : await prisma.profile.create({
        data: { email, password: passwordHash, fullName: 'European Promotion (Wholesale)', isVerified: true },
      });

  // The `supplier` role anchors the Supplier row (products, Stripe Connect,
  // payment methods); `eup` is what routes this account to the EUP console and
  // gates the price-list / freight endpoints.
  for (const role of ['supplier', 'eup']) {
    const has = await prisma.userRole.findFirst({ where: { userId: user.id, role } });
    if (!has) await prisma.userRole.create({ data: { userId: user.id, role } });
  }

  // 2) Supplier flagged as the EU house wholesaler.
  // Only set the normalized countryCode (FK -> Country) when that row exists,
  // so the seed works even against a DB where countries weren't seeded.
  const nl = await prisma.country.findUnique({ where: { code: 'NL' } });
  let supplier = await prisma.supplier.findUnique({ where: { userId: user.id } });
  const wholesalerData = {
    companyName: 'European Promotion',
    contactEmail: email,
    description:
      'EU house wholesaler — TYVEK® DuPont event wristbands. Reliable, customizable, perfect for any event.',
    country: 'NL',
    countryCode: nl ? 'NL' : null,
    isWholesaler: true,
    isHouseWholesaler: true,
    hasOwnProduction: true,
    status: 'ACTIVE',
  };
  if (supplier) {
    supplier = await prisma.supplier.update({ where: { id: supplier.id }, data: wholesalerData });
  } else {
    supplier = await prisma.supplier.create({ data: { userId: user.id, ...wholesalerData } });
  }

  // Ensure only this account is the house wholesaler.
  await prisma.supplier.updateMany({
    where: { isHouseWholesaler: true, id: { not: supplier.id } },
    data: { isHouseWholesaler: false },
  });

  // 3) Tyvek catalogue.
  await upsertTyvekProduct(supplier.id, {
    name: 'Tyvek Wristband — 19 × 225 mm',
    size: '19 × 225 mm',
    tiers: TIERS_19MM,
    sortOrder: 0,
  });
  await upsertTyvekProduct(supplier.id, {
    name: 'Tyvek Wristband — 25 × 225 mm',
    size: '25 × 225 mm',
    tiers: TIERS_25MM,
    sortOrder: 1,
  });

  console.log('✅ EU house wholesaler ready:', supplier.companyName, `(${email})`);
  console.log('   Tyvek catalogue seeded: 19×225 mm + 25×225 mm, print + QR + RFID options, 18 colours.');
  console.log('');
  console.log('   ℹ️  No EUP prices were seeded — what suppliers pay EUP is entered');
  console.log('       by EUP in /eup → Price lists. Until a product is priced there,');
  console.log('       suppliers cannot order it.');
  if (!providedPassword && !existingProfile) {
    console.log('');
    console.log('   ⚠️  Generated wholesaler login password (save it now, shown once):');
    console.log(`        ${email} / ${password}`);
    console.log('        Set HOUSE_WHOLESALER_PASSWORD to control it, or reset it later from admin.');
  } else if (existingProfile) {
    console.log('   (existing account — password unchanged.)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

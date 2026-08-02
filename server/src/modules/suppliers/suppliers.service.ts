import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ShippingService } from '../shipping/shipping.service';
import { CreateReviewDto, SupplierRegisterDto } from './suppliers.dto';
import {
  effectiveOptions,
  LEGACY_OPTION_KEYS,
  sanitizeOptionInput,
} from '../pricing/product-options';

/** Columns a supplier is allowed to set on a Product (prevents mass-assignment). */
const PRODUCT_WRITABLE_FIELDS = [
  'name',
  'description',
  'wristbandType',
  'priceUsd',
  'priceEur',
  'priceGbp',
  'printExtraUsd',
  'colorPrintExtraUsd',
  'logoExtraUsd',
  'designSetupFeeUsd',
  'designSetupFeeEur',
  'designSetupFeeGbp',
  'qrCodePriceUsd',
  'qrCodePriceEur',
  'qrCodePriceGbp',
  'trademarkFeeUsd',
  'trademarkFeeEur',
  'trademarkFeeGbp',
  'minOrderQuantity',
  'maxOrderQuantity',
  'isActive',
  'imageUrls',
  'allowsCustomText',
  'allowsCustomColor',
  'allowsLogoUpload',
  'allowsInnerText',
  'availableSizes',
  'availableColors',
] as const;

const PRICING_TIER_WRITABLE_FIELDS = [
  'minQuantity',
  'maxQuantity',
  'pricePerUnitUsd',
  'pricePerUnitEur',
  'pricePerUnitGbp',
] as const;

const PRICING_CONFIG_WRITABLE_FIELDS = [
  'wristbandType',
  'minQuantity',
  'basePriceUsd',
  'basePriceEur',
  'basePriceGbp',
  'blackPrintExtraUsd',
  'blackPrintExtraEur',
  'blackPrintExtraGbp',
  'fullColorPrintExtraUsd',
  'fullColorPrintExtraEur',
  'fullColorPrintExtraGbp',
  'secureGuestsExtraUsd',
  'secureGuestsExtraEur',
] as const;

function pick<T extends Record<string, any>>(
  source: T,
  fields: readonly string[],
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of fields) {
    if (source != null && source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

@Injectable()
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private subscriptions: SubscriptionsService,
    private shipping: ShippingService,
  ) {}

  /** Parse a Product.imageUrls JSON string into a clean string[]. */
  private parseImages(imageUrls?: string | null): string[] {
    if (!imageUrls) return [];
    try {
      const v = JSON.parse(imageUrls);
      return Array.isArray(v) ? v.filter((u) => typeof u === 'string' && u) : [];
    } catch {
      return [];
    }
  }

  /** Lowest per-unit price a supplier offers, for price sorting. null if no products. */
  private minProductPrice(products: { priceEur: number | null; priceUsd: number }[]): number | null {
    const prices = products.map((p) => p.priceEur ?? p.priceUsd).filter((n) => typeof n === 'number');
    return prices.length ? Math.min(...prices) : null;
  }

  private sanitizeTiers(tiers: any[]): Record<string, any>[] {
    return (Array.isArray(tiers) ? tiers : [])
      .map((t) => pick(t, PRICING_TIER_WRITABLE_FIELDS))
      .filter((t) => Number.isFinite(Number(t.minQuantity)));
  }

  /** Sanitize client-submitted options into product_options column values. */
  private sanitizeOptions(options: any[]): NonNullable<ReturnType<typeof sanitizeOptionInput>>[] {
    const usedKeys = new Set<string>();
    return (Array.isArray(options) ? options : [])
      .map((o, i) => sanitizeOptionInput(o, i, usedKeys))
      .filter((o): o is NonNullable<typeof o> => o !== null)
      .map((o, i) => ({ ...o, sortOrder: i }));
  }

  /**
   * Mirror well-known option prices back into the legacy Product columns so
   * anything still reading them (older clients, stored snapshots) sees the
   * same prices as the options system. Options are the source of truth.
   */
  private legacyColumnMirror(
    options: { key: string; priceUsd: number; priceEur: number | null; priceGbp: number | null; isActive: boolean }[],
  ): Record<string, number | null> {
    const byKey = new Map(options.filter((o) => o.isActive).map((o) => [o.key, o]));
    const usd = (key: string) => byKey.get(key)?.priceUsd ?? 0;
    return {
      printExtraUsd: usd(LEGACY_OPTION_KEYS.blackPrint),
      colorPrintExtraUsd: usd(LEGACY_OPTION_KEYS.fullColorPrint),
      logoExtraUsd: usd(LEGACY_OPTION_KEYS.logo),
      qrCodePriceUsd: usd(LEGACY_OPTION_KEYS.qrCode),
      qrCodePriceEur: byKey.get(LEGACY_OPTION_KEYS.qrCode)?.priceEur ?? null,
      qrCodePriceGbp: byKey.get(LEGACY_OPTION_KEYS.qrCode)?.priceGbp ?? null,
      designSetupFeeUsd: usd(LEGACY_OPTION_KEYS.designSetup),
      designSetupFeeEur: byKey.get(LEGACY_OPTION_KEYS.designSetup)?.priceEur ?? null,
      designSetupFeeGbp: byKey.get(LEGACY_OPTION_KEYS.designSetup)?.priceGbp ?? null,
      trademarkFeeUsd: usd(LEGACY_OPTION_KEYS.trademark),
      trademarkFeeEur: byKey.get(LEGACY_OPTION_KEYS.trademark)?.priceEur ?? null,
      trademarkFeeGbp: byKey.get(LEGACY_OPTION_KEYS.trademark)?.priceGbp ?? null,
    };
  }

  /**
   * Serialize a product for API responses: `options` always present (persisted
   * rows or legacy-column synthesis) with choices parsed from JSON.
   */
  private withOptions<T extends { options?: any[] } & Parameters<typeof effectiveOptions>[0]>(
    product: T,
  ) {
    return { ...product, options: effectiveOptions(product) };
  }

  async register(dto: SupplierRegisterDto) {
    const existing = await this.prisma.profile.findUnique({
      where: { email: dto.contactEmail },
    });
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.$transaction(async (prisma) => {
      const user = await prisma.profile.create({
        data: {
          email: dto.contactEmail,
          password: passwordHash,
          fullName: dto.companyName,
        },
      });

      await prisma.userRole.create({
        data: {
          userId: user.id,
          role: 'supplier',
        },
      });

      const supplier = await prisma.supplier.create({
        data: {
          userId: user.id,
          companyName: dto.companyName,
          contactEmail: dto.contactEmail,
          contactPhone: dto.contactPhone,
          address: dto.address,
          countryCode: dto.countryCode?.toUpperCase(),
          state: dto.state,
          city: dto.city,
          // Mirror the normalized code into the legacy string column so existing
          // directory/display code keeps working during the transition.
          country: dto.countryCode?.toUpperCase(),
        },
      });

      // Every supplier starts on a 1-month free trial (same transaction so a
      // supplier is never left without a subscription).
      await this.subscriptions.createTrialForSupplier(supplier.id, prisma);

      return { user, supplier };
    });

    const accessToken = this.jwtService.sign({
      sub: created.user.id,
      email: created.user.email,
      roles: ['supplier'],
    });

    return {
      accessToken,
      user: {
        id: created.user.id,
        email: created.user.email,
        fullName: created.user.fullName,
        roles: ['supplier'],
      },
      supplier: created.supplier,
    };
  }

  async findByUserId(userId: string) {
    return this.prisma.supplier.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
      },
    });
  }

  async findAll() {
    return this.prisma.supplier.findMany({
      // Wholesalers sell to suppliers, not customers — keep them out of the
      // customer-facing supplier picker.
      where: { isWholesaler: false },
      orderBy: { companyName: 'asc' },
      select: {
        id: true,
        companyName: true,
        contactEmail: true,
      },
    });
  }

  private toDirectoryEntry(s: {
    id: string;
    companyName: string;
    description: string | null;
    city: string | null;
    country: string | null;
    countryCode: string | null;
    logoUrl: string | null;
    rating: number;
    reviewCount: number;
    totalOrders: number;
    isVerified: boolean;
    createdAt: Date;
    products: { wristbandType: string; priceEur: number | null; priceUsd: number }[];
  }) {
    return {
      id: s.id,
      companyName: s.companyName,
      description: s.description,
      city: s.city,
      country: s.country,
      countryCode: s.countryCode,
      logoUrl: s.logoUrl,
      rating: s.rating,
      reviewCount: s.reviewCount,
      totalOrders: s.totalOrders,
      isVerified: s.isVerified,
      createdAt: s.createdAt,
      productCount: s.products.length,
      services: Array.from(new Set(s.products.map((p) => p.wristbandType))),
      fromPrice: this.minProductPrice(s.products),
    };
  }

  /**
   * Public supplier directory with country-aware ordering + filters.
   *  - `country`  : only suppliers in this ISO-2 country.
   *  - `category` : only suppliers offering this wristband type (active product).
   *  - `minRating`: minimum average rating.
   *  - `sort`     : rating (default) | newest | popular.
   *  - `near`     : customer's country — when set (and no explicit `country`
   *                 filter), local suppliers are floated to the top.
   */
  async directory(filters: {
    country?: string;
    category?: string;
    minRating?: number;
    sort?: string;
    near?: string;
  } = {}) {
    const where: Prisma.SupplierWhereInput = { status: { not: 'SUSPENDED' }, isWholesaler: false };
    if (filters.country) where.countryCode = filters.country.toUpperCase();
    if (typeof filters.minRating === 'number' && !Number.isNaN(filters.minRating)) {
      where.rating = { gte: filters.minRating };
    }
    if (filters.category) {
      where.products = { some: { isActive: true, wristbandType: filters.category } };
    }

    const orderBy: Prisma.SupplierOrderByWithRelationInput[] =
      filters.sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : filters.sort === 'popular'
          ? [{ totalOrders: 'desc' }, { reviewCount: 'desc' }]
          : filters.sort === 'rating_asc'
            ? [{ rating: 'asc' }, { reviewCount: 'desc' }, { companyName: 'asc' }]
            : [{ rating: 'desc' }, { reviewCount: 'desc' }, { companyName: 'asc' }];

    const suppliers = await this.prisma.supplier.findMany({
      where,
      orderBy,
      include: {
        products: {
          where: { isActive: true },
          select: { wristbandType: true, priceEur: true, priceUsd: true },
        },
      },
    });

    let entries = suppliers.map((s) => this.toDirectoryEntry(s));

    // Price sorts depend on each supplier's minimum product price, which is a
    // relation aggregate Prisma can't orderBy directly — sort in memory.
    // Suppliers with no products (no price) always sort last.
    if (filters.sort === 'price_asc' || filters.sort === 'price_desc') {
      const dir = filters.sort === 'price_asc' ? 1 : -1;
      entries = [...entries].sort((a, b) => {
        if (a.fromPrice == null && b.fromPrice == null) return 0;
        if (a.fromPrice == null) return 1;
        if (b.fromPrice == null) return -1;
        return (a.fromPrice - b.fromPrice) * dir;
      });
    }

    // Country-aware float: when a "near" country is provided and the caller
    // isn't already filtering to a specific country, show locals first while
    // preserving the chosen sort within each group.
    const near = filters.near?.toUpperCase();
    let mapped = entries.map((e) => ({ ...e, isLocal: !!near && e.countryCode === near }));
    if (near && !filters.country) {
      mapped = [...mapped].sort((a, b) => Number(b.isLocal) - Number(a.isLocal));
    }
    return mapped;
  }

  /** Suppliers the user has ordered from, most-recent first (for the dashboard). */
  async recentlyOrdered(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId, supplierId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { supplierId: true },
    });
    const orderedIds: string[] = [];
    for (const o of orders) {
      if (o.supplierId && !orderedIds.includes(o.supplierId)) orderedIds.push(o.supplierId);
    }
    if (orderedIds.length === 0) return [];

    const suppliers = await this.prisma.supplier.findMany({
      where: { id: { in: orderedIds } },
      include: {
        products: {
          where: { isActive: true },
          select: { wristbandType: true, priceEur: true, priceUsd: true },
        },
      },
    });
    const byId = new Map(suppliers.map((s) => [s.id, s]));
    return orderedIds
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => this.toDirectoryEntry(s));
  }

  /**
   * Public supplier storefront: company info + active products (with parsed
   * image galleries + pricing) + reviews + delivery couriers + aggregate stats.
   * Deliberately exposes only aggregate order counts — never other customers'
   * order data.
   */
  async getPublicProfile(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: {
        id: true,
        companyName: true,
        description: true,
        logoUrl: true,
        website: true,
        city: true,
        country: true,
        countryCode: true,
        rating: true,
        reviewCount: true,
        totalOrders: true,
        isVerified: true,
        status: true,
        isWholesaler: true,
        createdAt: true,
      },
    });
    if (!supplier || supplier.status === 'SUSPENDED' || supplier.isWholesaler) {
      throw new BadRequestException('Supplier not found');
    }

    const [products, reviews, shipping] = await Promise.all([
      this.prisma.product.findMany({
        where: { supplierId, isActive: true },
        include: this.productInclude,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.getReviews(supplierId),
      this.shipping.listForSupplier(supplierId),
    ]);

    const productsWithImages = products.map((p) => ({
      ...this.withOptions(p),
      images: this.parseImages(p.imageUrls),
    }));

    return {
      supplier,
      products: productsWithImages,
      reviews,
      shipping,
      stats: {
        productCount: products.length,
        ordersFulfilled: supplier.totalOrders,
        memberSince: supplier.createdAt,
        rating: supplier.rating,
        reviewCount: supplier.reviewCount,
      },
    };
  }

  async getReviews(supplierId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { fullName: true, email: true } } },
    });
    return reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      reviewer: r.user.fullName || r.user.email?.split('@')[0] || 'Customer',
    }));
  }

  /** Suppliers that delivered an order to this user and haven't been reviewed yet. */
  async pendingReviews(userId: string) {
    const delivered = await this.prisma.order.findMany({
      where: { userId, status: 'DELIVERED', supplierId: { not: null } },
      select: { supplierId: true, supplier: { select: { companyName: true } } },
      distinct: ['supplierId'],
    });
    const reviewed = await this.prisma.review.findMany({
      where: { userId },
      select: { supplierId: true },
    });
    const reviewedSet = new Set(reviewed.map((r) => r.supplierId));
    return delivered
      .filter((d) => d.supplierId && !reviewedSet.has(d.supplierId))
      .map((d) => ({ supplierId: d.supplierId as string, companyName: d.supplier?.companyName ?? 'Supplier' }));
  }

  /** Whether the current user is allowed to review this supplier (has a delivered order). */
  async canReview(userId: string, supplierId: string) {
    const delivered = await this.prisma.order.findFirst({
      where: { userId, supplierId, status: 'DELIVERED' },
      select: { id: true },
    });
    const existing = await this.prisma.review.findFirst({
      where: { userId, supplierId },
      select: { id: true, rating: true, comment: true },
    });
    return { canReview: !!delivered, existingReview: existing };
  }

  /** Create/update a review — only allowed once the supplier has delivered an order. */
  async createReview(userId: string, supplierId: string, dto: CreateReviewDto) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new BadRequestException('Supplier not found');

    const delivered = await this.prisma.order.findFirst({
      where: { userId, supplierId, status: 'DELIVERED' },
      select: { id: true },
    });
    if (!delivered) {
      throw new ForbiddenException('You can only review a supplier after they deliver an order to you');
    }

    const existing = await this.prisma.review.findFirst({ where: { userId, supplierId } });
    if (existing) {
      await this.prisma.review.update({
        where: { id: existing.id },
        data: { rating: dto.rating, comment: dto.comment ?? null },
      });
    } else {
      await this.prisma.review.create({
        data: { userId, supplierId, orderId: delivered.id, rating: dto.rating, comment: dto.comment ?? null },
      });
    }

    // Recompute the supplier's aggregate rating + count.
    const agg = await this.prisma.review.aggregate({
      where: { supplierId },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.supplier.update({
      where: { id: supplierId },
      data: { rating: agg._avg.rating ?? 0, reviewCount: agg._count },
    });

    return this.getReviews(supplierId);
  }

  async getPricing(userId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { userId },
    });
    if (!supplier) throw new BadRequestException('Not a supplier');

    return this.prisma.pricingConfig.findMany({
      where: { supplierId: supplier.id },
      orderBy: { wristbandType: 'asc' },
    });
  }

  async getPricingForSupplier(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
    });
    if (!supplier) throw new BadRequestException('Supplier not found');

    return this.prisma.pricingConfig.findMany({
      where: { supplierId },
      orderBy: { wristbandType: 'asc' },
    });
  }

  async getPricingBySupplierId(supplierId: string) {
    return this.prisma.pricingConfig.findMany({
      where: { supplierId },
    });
  }

  /**
   * Replace the supplier's pricing configs for the submitted wristband types.
   *
   * The previous implementation upserted keyed only on (supplierId,
   * wristbandType) and ignored `minQuantity`, so multiple quantity tiers of
   * the same type collapsed into one row — saved tiers "disappeared" after the
   * next reload/login. This rewrite is a transactional replace: for every
   * wristband type present in the payload, all existing rows are removed and
   * the submitted rows (deduplicated by minQuantity) are recreated, so what
   * the supplier saved is exactly what reloads.
   */
  async updatePricing(userId: string, dto: any) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { userId },
    });
    if (!supplier) throw new BadRequestException('Not a supplier');

    const submitted = (Array.isArray(dto) ? dto : [dto])
      .map((c) => pick(c, PRICING_CONFIG_WRITABLE_FIELDS))
      .filter((c) => typeof c.wristbandType === 'string' && c.wristbandType.trim());

    // Deduplicate by (wristbandType, minQuantity) — last entry wins.
    const byKey = new Map<string, Record<string, any>>();
    for (const c of submitted) {
      byKey.set(`${c.wristbandType}::${Number(c.minQuantity) || 0}`, c);
    }
    const configs = [...byKey.values()];
    const touchedTypes = [...new Set(configs.map((c) => c.wristbandType as string))];

    if (touchedTypes.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.pricingConfig.deleteMany({
          where: { supplierId: supplier.id, wristbandType: { in: touchedTypes } },
        });
        await tx.pricingConfig.createMany({
          data: configs.map((c) => ({
            ...c,
            supplierId: supplier.id,
          })) as Prisma.PricingConfigCreateManyInput[],
        });
      });
    }

    return this.prisma.pricingConfig.findMany({
      where: { supplierId: supplier.id },
      orderBy: [{ wristbandType: 'asc' }, { minQuantity: 'asc' }],
    });
  }

  /** Standard include for product reads: tiers + options in display order. */
  private readonly productInclude = {
    pricingTiers: { orderBy: { minQuantity: 'asc' } },
    options: { orderBy: { sortOrder: 'asc' } },
  } satisfies Prisma.ProductInclude;

  async getProductsBySupplierId(supplierId: string) {
    const products = await this.prisma.product.findMany({
      // Never expose a wholesaler's catalog through the public per-supplier route.
      where: { supplierId, isActive: true, supplier: { isWholesaler: false } },
      include: this.productInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return products.map((p) => this.withOptions(p));
  }

  async getMyProducts(userId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { userId },
    });
    if (!supplier) throw new BadRequestException('Not a supplier');
    const products = await this.prisma.product.findMany({
      where: { supplierId: supplier.id },
      include: this.productInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return products.map((p) => this.withOptions(p));
  }

  async createProduct(userId: string, dto: any) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { userId },
    });
    if (!supplier) throw new BadRequestException('Not a supplier');

    // Gate: an active subscription (and a non-suspended account) is required to
    // create new products. Existing products remain readable/editable.
    await this.subscriptions.assertActive(supplier.id);

    const productData = pick(dto, PRODUCT_WRITABLE_FIELDS);
    const tiers = this.sanitizeTiers(dto.pricingTiers);
    // Options are only persisted when the client sends them; otherwise the
    // legacy columns remain the source and are synthesized on read.
    const options = Array.isArray(dto.options) ? this.sanitizeOptions(dto.options) : null;

    const created = await this.prisma.$transaction(async (tx) => {
      // New products go to the end of the supplier's list.
      const last = await tx.product.findFirst({
        where: { supplierId: supplier.id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const product = await tx.product.create({
        data: {
          ...productData,
          ...(options ? this.legacyColumnMirror(options) : {}),
          sortOrder: (last?.sortOrder ?? -1) + 1,
          supplierId: supplier.id,
        } as Prisma.ProductUncheckedCreateInput,
      });
      if (tiers.length > 0) {
        await tx.supplierPricingTier.createMany({
          data: tiers.map((t) => ({
            ...t,
            productId: product.id,
          })) as Prisma.SupplierPricingTierCreateManyInput[],
        });
      }
      if (options && options.length > 0) {
        await tx.productOption.createMany({
          data: options.map((o) => ({ ...o, productId: product.id })),
        });
      }
      return product;
    });

    const full = await this.prisma.product.findUnique({
      where: { id: created.id },
      include: this.productInclude,
    });
    return full ? this.withOptions(full) : full;
  }

  async updateProduct(userId: string, productId: string, dto: any) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { userId },
    });
    if (!supplier) throw new BadRequestException('Not a supplier');

    const product = await this.prisma.product.findFirst({
      where: { id: productId, supplierId: supplier.id },
    });
    if (!product) throw new BadRequestException('Product not found');

    const productData = pick(dto, PRODUCT_WRITABLE_FIELDS);
    const options = Array.isArray(dto.options) ? this.sanitizeOptions(dto.options) : null;

    // One transaction for the product + tier + option rewrite, so a failure
    // mid-way can never leave the product with its tiers or options dropped.
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { ...productData, ...(options ? this.legacyColumnMirror(options) : {}) },
      });

      if (Array.isArray(dto.pricingTiers)) {
        const tiers = this.sanitizeTiers(dto.pricingTiers);
        await tx.supplierPricingTier.deleteMany({ where: { productId } });
        if (tiers.length > 0) {
          await tx.supplierPricingTier.createMany({
            data: tiers.map((t) => ({
              ...t,
              productId,
            })) as Prisma.SupplierPricingTierCreateManyInput[],
          });
        }
      }

      if (options) {
        await tx.productOption.deleteMany({ where: { productId } });
        if (options.length > 0) {
          await tx.productOption.createMany({
            data: options.map((o) => ({ ...o, productId })),
          });
        }
      }
    });

    const full = await this.prisma.product.findUnique({
      where: { id: productId },
      include: this.productInclude,
    });
    return full ? this.withOptions(full) : full;
  }

  /** Persist the supplier's chosen product ordering (array of product ids, first = top). */
  async reorderProducts(userId: string, productIds: string[]) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { userId },
    });
    if (!supplier) throw new BadRequestException('Not a supplier');
    if (!Array.isArray(productIds) || productIds.length === 0) {
      throw new BadRequestException('productIds must be a non-empty array');
    }

    const owned = await this.prisma.product.findMany({
      where: { supplierId: supplier.id, id: { in: productIds } },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((p) => p.id));

    await this.prisma.$transaction(
      productIds
        .filter((id) => ownedIds.has(id))
        .map((id, index) =>
          this.prisma.product.update({ where: { id }, data: { sortOrder: index } }),
        ),
    );
    return this.getMyProducts(userId);
  }

  async deleteProduct(userId: string, productId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { userId },
    });
    if (!supplier) throw new BadRequestException('Not a supplier');

    const product = await this.prisma.product.findFirst({
      where: { id: productId, supplierId: supplier.id },
    });
    if (!product) throw new BadRequestException('Product not found');

    await this.prisma.product.delete({ where: { id: productId } });
    return { success: true };
  }
}

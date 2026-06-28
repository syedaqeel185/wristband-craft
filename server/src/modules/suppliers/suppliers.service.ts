import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto, SupplierRegisterDto } from './suppliers.dto';

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
  ) {}

  private sanitizeTiers(tiers: any[]): Record<string, any>[] {
    return (Array.isArray(tiers) ? tiers : []).map((t) =>
      pick(t, PRICING_TIER_WRITABLE_FIELDS),
    );
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
        },
      });

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
    logoUrl: string | null;
    rating: number;
    reviewCount: number;
    isVerified: boolean;
    products: { wristbandType: string }[];
  }) {
    return {
      id: s.id,
      companyName: s.companyName,
      description: s.description,
      city: s.city,
      country: s.country,
      logoUrl: s.logoUrl,
      rating: s.rating,
      reviewCount: s.reviewCount,
      isVerified: s.isVerified,
      productCount: s.products.length,
      services: Array.from(new Set(s.products.map((p) => p.wristbandType))),
    };
  }

  /** Public homepage directory: company, location, rating, services (product types). */
  async directory() {
    const suppliers = await this.prisma.supplier.findMany({
      orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }, { companyName: 'asc' }],
      include: {
        products: { where: { isActive: true }, select: { wristbandType: true } },
      },
    });
    return suppliers.map((s) => this.toDirectoryEntry(s));
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
      include: { products: { where: { isActive: true }, select: { wristbandType: true } } },
    });
    const byId = new Map(suppliers.map((s) => [s.id, s]));
    return orderedIds
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => this.toDirectoryEntry(s));
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

  async updatePricing(userId: string, dto: any) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { userId },
    });
    if (!supplier) throw new BadRequestException('Not a supplier');

    // If it's a single object, first check if a config for this wristband type already exists
    if (!Array.isArray(dto)) {
      const existingConfig = await this.prisma.pricingConfig.findFirst({
        where: { supplierId: supplier.id, wristbandType: dto.wristbandType },
      });

      if (existingConfig) {
        await this.prisma.pricingConfig.update({
          where: { id: existingConfig.id },
          data: { ...dto, supplierId: supplier.id },
        });
      } else {
        await this.prisma.pricingConfig.create({
          data: { ...dto, supplierId: supplier.id },
        });
      }
    } else {
      // Handle array of configs
      const configs = dto;
      for (const config of configs) {
        if (config.id) {
          await this.prisma.pricingConfig.update({
            where: { id: config.id },
            data: { ...config, supplierId: supplier.id },
          });
        } else {
          const existingConfig = await this.prisma.pricingConfig.findFirst({
            where: {
              supplierId: supplier.id,
              wristbandType: config.wristbandType,
            },
          });
          if (existingConfig) {
            await this.prisma.pricingConfig.update({
              where: { id: existingConfig.id },
              data: { ...config, supplierId: supplier.id },
            });
          } else {
            await this.prisma.pricingConfig.create({
              data: { ...config, supplierId: supplier.id },
            });
          }
        }
      }
    }

    return this.prisma.pricingConfig.findMany({
      where: { supplierId: supplier.id },
      orderBy: { wristbandType: 'asc' },
    });
  }

  async getProductsBySupplierId(supplierId: string) {
    return this.prisma.product.findMany({
      where: { supplierId, isActive: true },
      include: { pricingTiers: true },
      orderBy: { name: 'asc' },
    });
  }

  async getMyProducts(userId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { userId },
    });
    if (!supplier) throw new BadRequestException('Not a supplier');
    return this.prisma.product.findMany({
      where: { supplierId: supplier.id },
      include: { pricingTiers: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProduct(userId: string, dto: any) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { userId },
    });
    if (!supplier) throw new BadRequestException('Not a supplier');

    const { pricingTiers } = dto;
    const productData = pick(dto, PRODUCT_WRITABLE_FIELDS);
    const product = await this.prisma.product.create({
      data: {
        ...productData,
        supplierId: supplier.id,
      } as Prisma.ProductUncheckedCreateInput,
    });

    const tiers = this.sanitizeTiers(pricingTiers);
    if (tiers.length > 0) {
      await this.prisma.supplierPricingTier.createMany({
        data: tiers.map((t) => ({
          ...t,
          productId: product.id,
        })) as Prisma.SupplierPricingTierCreateManyInput[],
      });
    }

    return this.prisma.product.findUnique({
      where: { id: product.id },
      include: { pricingTiers: true },
    });
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

    const { pricingTiers } = dto;
    const productData = pick(dto, PRODUCT_WRITABLE_FIELDS);
    await this.prisma.product.update({
      where: { id: productId },
      data: productData,
    });

    if (Array.isArray(pricingTiers)) {
      const tiers = this.sanitizeTiers(pricingTiers);
      await this.prisma.supplierPricingTier.deleteMany({
        where: { productId },
      });
      if (tiers.length > 0) {
        await this.prisma.supplierPricingTier.createMany({
          data: tiers.map((t) => ({
            ...t,
            productId,
          })) as Prisma.SupplierPricingTierCreateManyInput[],
        });
      }
    }

    return this.prisma.product.findUnique({
      where: { id: productId },
      include: { pricingTiers: true },
    });
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

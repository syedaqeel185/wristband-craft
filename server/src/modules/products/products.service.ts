import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { effectiveOptions } from '../pricing/product-options';

export interface ProductBrowseFilters {
  wristbandType?: string;
  supplierId?: string;
  search?: string;
}

const SUPPLIER_PUBLIC_SELECT = {
  id: true,
  companyName: true,
  city: true,
  country: true,
  logoUrl: true,
  rating: true,
  isVerified: true,
} satisfies Prisma.SupplierSelect;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public catalog: active products across all suppliers, with optional filters. */
  async browse(filters: ProductBrowseFilters = {}) {
    // Wholesaler catalogs sell to suppliers, not end customers — never surface
    // them in the public catalog.
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      supplier: { isWholesaler: false },
    };

    if (filters.wristbandType) {
      where.wristbandType = filters.wristbandType;
    }
    if (filters.supplierId) {
      where.supplierId = filters.supplierId;
    }
    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }

    const products = await this.prisma.product.findMany({
      where,
      include: {
        pricingTiers: { orderBy: { minQuantity: 'asc' } },
        options: { orderBy: { sortOrder: 'asc' } },
        supplier: { select: SUPPLIER_PUBLIC_SELECT },
      },
      orderBy: filters.supplierId
        ? [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
        : { createdAt: 'desc' },
    });
    return products.map((p) => ({ ...p, options: effectiveOptions(p) }));
  }

  /** Public product detail. Only active products are exposed. */
  async getById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, isActive: true, supplier: { isWholesaler: false } },
      include: {
        pricingTiers: { orderBy: { minQuantity: 'asc' } },
        options: { orderBy: { sortOrder: 'asc' } },
        supplier: { select: SUPPLIER_PUBLIC_SELECT },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return { ...product, options: effectiveOptions(product) };
  }

  /** Distinct wristband types offered by active products (for filters/menus). */
  async listWristbandTypes(): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where: { isActive: true, supplier: { isWholesaler: false } },
      select: { wristbandType: true },
      distinct: ['wristbandType'],
      orderBy: { wristbandType: 'asc' },
    });
    return rows.map((r) => r.wristbandType).filter(Boolean);
  }
}

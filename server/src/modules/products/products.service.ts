import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
    const where: Prisma.ProductWhereInput = { isActive: true };

    if (filters.wristbandType) {
      where.wristbandType = filters.wristbandType;
    }
    if (filters.supplierId) {
      where.supplierId = filters.supplierId;
    }
    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }

    return this.prisma.product.findMany({
      where,
      include: {
        pricingTiers: { orderBy: { minQuantity: 'asc' } },
        supplier: { select: SUPPLIER_PUBLIC_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Public product detail. Only active products are exposed. */
  async getById(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, isActive: true },
      include: {
        pricingTiers: { orderBy: { minQuantity: 'asc' } },
        supplier: { select: SUPPLIER_PUBLIC_SELECT },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }
}

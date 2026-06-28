import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDesignDto } from './designs.dto';

@Injectable()
export class DesignsService {
  constructor(private readonly prisma: PrismaService) {}

  private safeJson(s: string | null | undefined) {
    if (!s) return null;
    try {
      return JSON.parse(s) as unknown;
    } catch {
      return null;
    }
  }

  async create(userId: string, dto: CreateDesignDto) {
    return this.prisma.design.create({
      data: {
        userId,
        designUrl: dto.designUrl,
        wristbandColor: dto.wristbandColor,
        wristbandType: dto.wristbandType,
        customText: dto.customText,
        textColor: dto.textColor,
        textPosition: dto.textPosition ? JSON.stringify(dto.textPosition) : undefined,
        canvasJson: dto.canvasJson ?? undefined,
        metaJson: dto.metaJson ?? undefined,
      },
    });
  }

  async findMine(userId: string) {
    const designs = await this.prisma.design.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return designs.map((design) => ({
      ...design,
      textPosition: design.textPosition ? JSON.parse(design.textPosition) : null,
    }));
  }

  async findPlatformView(user: { id: string; roles: string[] }) {
    const isAdmin = user.roles.includes('admin');
    if (!isAdmin && !user.roles.includes('supplier')) {
      throw new ForbiddenException();
    }
    const designs = await this.prisma.design.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        orders: { select: { id: true, supplierId: true, status: true, createdAt: true } },
      },
    });
    if (isAdmin) {
      return designs.map((design) => ({
        ...design,
        textPosition: this.safeJson(design.textPosition) as object | null,
        logoPosition: this.safeJson(design.logoPosition) as object | null,
        clipArtPosition: this.safeJson(design.clipArtPosition) as object | null,
        visibility: 'full' as const,
      }));
    }
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } });
    if (!supplier) return [];
    return designs.map((design) => {
      const hasOwnOrder = design.orders.some((o) => o.supplierId === supplier.id);
      const showCustomer = hasOwnOrder;
      return {
        ...design,
        user: showCustomer
          ? design.user
          : { id: design.userId, email: '—', fullName: null as string | null },
        textPosition: this.safeJson(design.textPosition) as object | null,
        logoPosition: this.safeJson(design.logoPosition) as object | null,
        clipArtPosition: this.safeJson(design.clipArtPosition) as object | null,
        orders: hasOwnOrder ? design.orders : [],
        visibility: (hasOwnOrder ? 'fulfillment' : 'platform') as 'fulfillment' | 'platform',
      };
    });
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.design.deleteMany({
      where: { id, userId },
    });
    return { deleted: result.count };
  }
}

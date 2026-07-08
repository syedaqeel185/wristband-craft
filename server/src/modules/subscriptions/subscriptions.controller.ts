import { Body, Controller, Delete, Get, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplyCouponDto, ChangePlanDto } from './subscriptions.dto';

@Controller('subscriptions')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Active plans (for the billing page + plan switcher). Any authenticated user. */
  @Get('plans')
  plans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceUsd: 'asc' },
    });
  }

  @Get('me')
  @Roles('supplier')
  me(@Request() req: any) {
    return this.subscriptions.getMine(req.user.id);
  }

  @Get('me/payments')
  @Roles('supplier')
  payments(@Request() req: any) {
    return this.subscriptions.getMyPayments(req.user.id);
  }

  @Post('me/cancel')
  @Roles('supplier')
  cancel(@Request() req: any) {
    return this.subscriptions.cancel(req.user.id);
  }

  @Post('me/resume')
  @Roles('supplier')
  resume(@Request() req: any) {
    return this.subscriptions.resume(req.user.id);
  }

  @Post('me/plan')
  @Roles('supplier')
  changePlan(@Request() req: any, @Body() dto: ChangePlanDto) {
    return this.subscriptions.changePlan(req.user.id, dto.planCode);
  }

  @Post('me/coupon')
  @Roles('supplier')
  applyCoupon(@Request() req: any, @Body() dto: ApplyCouponDto) {
    return this.subscriptions.applyCoupon(req.user.id, dto.code);
  }

  @Delete('me/coupon')
  @Roles('supplier')
  removeCoupon(@Request() req: any) {
    return this.subscriptions.removeCoupon(req.user.id);
  }
}

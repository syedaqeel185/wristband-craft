import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { AdminService } from './admin.service';
import {
  CreateCouponDto,
  CreatePlanDto,
  UpdateCouponDto,
  UpdatePlanDto,
  UpdateSubscriptionDto,
  UpsertTaxRateDto,
} from './admin.dto';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview();
  }

  @Get('suppliers')
  suppliers(
    @Query('search') search?: string,
    @Query('country') country?: string,
    @Query('status') status?: string,
  ) {
    return this.admin.listSuppliers({ search, country, status });
  }

  @Get('suppliers/:id')
  supplier(@Param('id') id: string) {
    return this.admin.getSupplier(id);
  }

  @Patch('suppliers/:id/suspend')
  suspend(@Request() req: any, @Param('id') id: string) {
    return this.admin.setSupplierStatus(id, 'SUSPENDED', { userId: req.user.id });
  }

  @Patch('suppliers/:id/activate')
  activate(@Request() req: any, @Param('id') id: string) {
    return this.admin.setSupplierStatus(id, 'ACTIVE', { userId: req.user.id });
  }

  @Delete('suppliers/:id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.admin.deleteSupplier(id, { userId: req.user.id });
  }

  @Get('subscriptions')
  subscriptions(@Query('status') status?: string) {
    return this.admin.listSubscriptions(status);
  }

  @Patch('subscriptions/:id')
  updateSubscription(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.admin.updateSubscription(id, dto, { userId: req.user.id });
  }

  @Get('plans')
  plans() {
    return this.admin.listPlans();
  }

  @Post('plans')
  createPlan(@Request() req: any, @Body() dto: CreatePlanDto) {
    return this.admin.createPlan(dto, { userId: req.user.id });
  }

  @Patch('plans/:id')
  updatePlan(@Request() req: any, @Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.admin.updatePlan(id, dto, { userId: req.user.id });
  }

  @Get('revenue')
  revenue() {
    return this.admin.revenue();
  }

  @Get('coupons')
  coupons() {
    return this.admin.listCoupons();
  }

  @Post('coupons')
  createCoupon(@Request() req: any, @Body() dto: CreateCouponDto) {
    return this.admin.createCoupon(dto, { userId: req.user.id });
  }

  @Patch('coupons/:id')
  updateCoupon(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateCouponDto) {
    return this.admin.updateCoupon(id, dto, { userId: req.user.id });
  }

  @Get('tax-rates')
  taxRates() {
    return this.admin.listTaxRates();
  }

  @Post('tax-rates')
  upsertTaxRate(@Request() req: any, @Body() dto: UpsertTaxRateDto) {
    return this.admin.upsertTaxRate(dto, { userId: req.user.id });
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SuppliersService } from './suppliers.service';
import { ShippingService } from '../shipping/shipping.service';
import { CreateReviewDto, SupplierRegisterDto } from './suppliers.dto';

@Controller('suppliers')
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly shippingService: ShippingService,
  ) {}

  @Post('register')
  register(@Body() dto: SupplierRegisterDto) {
    return this.suppliersService.register(dto);
  }

  // ---- Authenticated "me" (current supplier) routes ----
  // IMPORTANT: these static routes MUST be declared before the parametric
  // ":id/..." routes below. Express/Nest matches in declaration order, so if
  // ":id/products" came first, "me" would be captured as an :id param and the
  // current supplier's own products would never be returned.

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  me(@Request() req: any) {
    return this.suppliersService.findByUserId(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me/pricing')
  getPricing(@Request() req: any) {
    return this.suppliersService.getPricing(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('me/pricing')
  updatePricing(@Request() req: any, @Body() dto: any) {
    return this.suppliersService.updatePricing(req.user.id, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me/products')
  getMyProducts(@Request() req: any) {
    return this.suppliersService.getMyProducts(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('me/products')
  createProduct(@Request() req: any, @Body() dto: any) {
    return this.suppliersService.createProduct(req.user.id, dto);
  }

  // Static route — must precede the ':productId' route below.
  @UseGuards(AuthGuard('jwt'))
  @Patch('me/products/reorder')
  reorderProducts(@Request() req: any, @Body() dto: { productIds: string[] }) {
    return this.suppliersService.reorderProducts(req.user.id, dto?.productIds ?? []);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('me/products/:productId')
  updateProduct(@Request() req: any, @Param('productId') productId: string, @Body() dto: any) {
    return this.suppliersService.updateProduct(req.user.id, productId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('me/products/:productId')
  deleteProduct(@Request() req: any, @Param('productId') productId: string) {
    return this.suppliersService.deleteProduct(req.user.id, productId);
  }

  // ---- Delivery / couriers (current supplier) ----

  @UseGuards(AuthGuard('jwt'))
  @Get('me/shipping')
  getMyShipping(@Request() req: any) {
    return this.shippingService.listMine(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('me/shipping')
  createShipping(@Request() req: any, @Body() dto: any) {
    return this.shippingService.create(req.user.id, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('me/shipping/:rateId')
  updateShipping(@Request() req: any, @Param('rateId') rateId: string, @Body() dto: any) {
    return this.shippingService.update(req.user.id, rateId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('me/shipping/:rateId')
  deleteShipping(@Request() req: any, @Param('rateId') rateId: string) {
    return this.shippingService.remove(req.user.id, rateId);
  }

  // ---- Reviews (current user) ----

  @UseGuards(AuthGuard('jwt'))
  @Get('pending-reviews')
  pendingReviews(@Request() req: any) {
    return this.suppliersService.pendingReviews(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('recent')
  recent(@Request() req: any) {
    return this.suppliersService.recentlyOrdered(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':id/can-review')
  canReview(@Request() req: any, @Param('id') id: string) {
    return this.suppliersService.canReview(req.user.id, id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/reviews')
  createReview(@Request() req: any, @Param('id') id: string, @Body() dto: CreateReviewDto) {
    return this.suppliersService.createReview(req.user.id, id, dto);
  }

  // ---- Public listing + parametric routes ----

  @Get('directory')
  directory(
    @Query('country') country?: string,
    @Query('category') category?: string,
    @Query('minRating') minRating?: string,
    @Query('sort') sort?: string,
    @Query('near') near?: string,
  ) {
    return this.suppliersService.directory({
      country,
      category,
      minRating: minRating != null ? Number(minRating) : undefined,
      sort,
      near,
    });
  }

  @Get()
  list() {
    return this.suppliersService.findAll();
  }

  @Get(':id/profile')
  getProfile(@Param('id') id: string) {
    return this.suppliersService.getPublicProfile(id);
  }

  @Get(':id/shipping')
  getShippingForSupplier(@Param('id') id: string) {
    return this.shippingService.listForSupplier(id);
  }

  @Get(':id/reviews')
  getReviews(@Param('id') id: string) {
    return this.suppliersService.getReviews(id);
  }

  @Get(':id/pricing')
  getPricingForSupplier(@Param('id') id: string) {
    return this.suppliersService.getPricingForSupplier(id);
  }

  @Get(':id/products')
  getSupplierProducts(@Param('id') id: string) {
    return this.suppliersService.getProductsBySupplierId(id);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { WholesaleService } from './wholesale.service';
import {
  CreateEupSupplierDto,
  PlaceWholesaleOrderDto,
  SetProductionDto,
  SetSupplierStatusDto,
  UpdateWholesaleOrderStatusDto,
  UpsertDiscountDto,
  UpsertEupFreightDto,
  UpsertEupPriceDto,
  UpsertOfferDto,
  WholesaleConfirmStripeDto,
  WholesaleReceiptDto,
} from './wholesale.dto';

/**
 * Buyer-side routes (a supplier ordering from EUP) are open to any authenticated
 * supplier and scoped in the service. Seller-side routes — price lists, freight,
 * discounts, offers, inbound fulfilment — additionally require the `eup` role.
 */
@Controller('wholesale')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class WholesaleController {
  constructor(private readonly wholesale: WholesaleService) {}

  // ---- Buyer: order from my wholesaler ----

  @Get('me/wholesaler')
  myWholesaler(@Request() req: any) {
    return this.wholesale.getMyWholesaler(req.user.id);
  }

  @Get('me/catalog')
  catalog(@Request() req: any) {
    return this.wholesale.getCatalog(req.user.id);
  }

  @Post('me/quote')
  quote(@Request() req: any, @Body() dto: PlaceWholesaleOrderDto) {
    return this.wholesale.quoteForBuyer(req.user.id, dto);
  }

  @Post('me/orders')
  place(@Request() req: any, @Body() dto: PlaceWholesaleOrderDto) {
    return this.wholesale.placeOrder(req.user.id, dto);
  }

  @Get('me/orders')
  outbound(@Request() req: any) {
    return this.wholesale.listOutbound(req.user.id);
  }

  @Patch('me/production')
  setProduction(@Request() req: any, @Body() dto: SetProductionDto) {
    return this.wholesale.setProduction(req.user.id, dto);
  }

  // ---- Buyer: pay the wholesaler for a wholesale order ----

  @Get('orders/:id/payment-options')
  paymentOptions(@Request() req: any, @Param('id') id: string) {
    return this.wholesale.getPaymentOptions(req.user.id, id);
  }

  @Post('orders/:id/pay/stripe')
  payStripe(@Request() req: any, @Param('id') id: string) {
    return this.wholesale.payByStripe(req.user.id, id);
  }

  @Post('orders/:id/pay/receipt')
  payReceipt(@Request() req: any, @Param('id') id: string, @Body() dto: WholesaleReceiptDto) {
    return this.wholesale.submitPaymentReceipt(req.user.id, id, dto.provider, dto.receiptUrl);
  }

  @Post('payments/confirm')
  confirmStripe(@Request() req: any, @Body() dto: WholesaleConfirmStripeDto) {
    return this.wholesale.confirmStripe(req.user.id, dto.sessionId);
  }

  @Post('orders/:id/mark-paid')
  markPaid(@Request() req: any, @Param('id') id: string) {
    return this.wholesale.markPaidByWholesaler(
      { id: req.user.id, roles: req.user.roles || [] },
      id,
    );
  }

  // ---- EUP: inbound orders + fulfilment ----

  @Get('me/inbound')
  @Roles('eup')
  inbound(@Request() req: any) {
    return this.wholesale.listInbound(req.user.id);
  }

  // Not @Roles('eup'): a buyer may cancel their own order while it is PLACED.
  // The service decides who may do what to this order.
  @Patch('orders/:id/status')
  updateStatus(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateWholesaleOrderStatusDto) {
    return this.wholesale.updateOrderStatus(req.user.id, id, dto);
  }

  // ---- EUP: the suppliers it sells to ----

  @Get('me/buyers')
  @Roles('eup')
  buyers(@Request() req: any) {
    return this.wholesale.listBuyers(req.user.id);
  }

  /** Onboard a supplier into EUP's book. Returns a one-time password. */
  @Post('me/buyers')
  @Roles('eup')
  createBuyer(@Request() req: any, @Body() dto: CreateEupSupplierDto) {
    return this.wholesale.createBuyer(req.user.id, dto);
  }

  @Patch('me/buyers/:id/status')
  @Roles('eup')
  setBuyerStatus(@Request() req: any, @Param('id') id: string, @Body() dto: SetSupplierStatusDto) {
    return this.wholesale.setBuyerStatus(req.user.id, id, dto.status as 'ACTIVE' | 'SUSPENDED');
  }

  @Patch('me/buyers/:id/production')
  @Roles('eup')
  setBuyerProduction(@Request() req: any, @Param('id') id: string, @Body() dto: SetProductionDto) {
    return this.wholesale.setBuyerProduction(req.user.id, id, dto.hasOwnProduction);
  }

  @Delete('me/buyers/:id')
  @Roles('eup')
  deleteBuyer(@Request() req: any, @Param('id') id: string) {
    return this.wholesale.deleteBuyer(req.user.id, id);
  }

  // ---- EUP: what is costing it sales ----

  @Get('me/insights')
  @Roles('eup')
  insights(@Request() req: any) {
    return this.wholesale.getInsights(req.user.id);
  }

  // ---- EUP: fixed price lists (per 1000 pcs) ----

  @Get('me/prices')
  @Roles('eup')
  listPrices(@Request() req: any) {
    return this.wholesale.listEupPrices(req.user.id);
  }

  @Post('me/prices')
  @Roles('eup')
  upsertPrice(@Request() req: any, @Body() dto: UpsertEupPriceDto) {
    return this.wholesale.upsertEupPrice(req.user.id, dto);
  }

  @Delete('me/prices/:id')
  @Roles('eup')
  deletePrice(@Request() req: any, @Param('id') id: string) {
    return this.wholesale.deleteEupPrice(req.user.id, id);
  }

  // ---- EUP: freight, billed on top of goods ----

  @Get('me/freight')
  @Roles('eup')
  listFreight(@Request() req: any) {
    return this.wholesale.listEupFreight(req.user.id);
  }

  @Post('me/freight')
  @Roles('eup')
  createFreight(@Request() req: any, @Body() dto: UpsertEupFreightDto) {
    return this.wholesale.createEupFreight(req.user.id, dto);
  }

  @Patch('me/freight/:id')
  @Roles('eup')
  updateFreight(@Request() req: any, @Param('id') id: string, @Body() dto: UpsertEupFreightDto) {
    return this.wholesale.updateEupFreight(req.user.id, id, dto);
  }

  @Delete('me/freight/:id')
  @Roles('eup')
  deleteFreight(@Request() req: any, @Param('id') id: string) {
    return this.wholesale.deleteEupFreight(req.user.id, id);
  }

  // ---- EUP: promotional discounts + offers (no longer affect what is charged) ----

  @Get('me/discounts')
  @Roles('eup')
  listDiscounts(@Request() req: any) {
    return this.wholesale.listDiscounts(req.user.id);
  }

  @Post('me/discounts')
  @Roles('eup')
  upsertDiscount(@Request() req: any, @Body() dto: UpsertDiscountDto) {
    return this.wholesale.upsertDiscount(req.user.id, dto);
  }

  @Delete('me/discounts/:id')
  @Roles('eup')
  deleteDiscount(@Request() req: any, @Param('id') id: string) {
    return this.wholesale.deleteDiscount(req.user.id, id);
  }

  @Get('me/offers')
  @Roles('eup')
  listOffers(@Request() req: any) {
    return this.wholesale.listOffers(req.user.id);
  }

  @Post('me/offers')
  @Roles('eup')
  createOffer(@Request() req: any, @Body() dto: UpsertOfferDto) {
    return this.wholesale.createOffer(req.user.id, dto);
  }

  @Patch('me/offers/:id')
  @Roles('eup')
  updateOffer(@Request() req: any, @Param('id') id: string, @Body() dto: UpsertOfferDto) {
    return this.wholesale.updateOffer(req.user.id, id, dto);
  }

  @Delete('me/offers/:id')
  @Roles('eup')
  deleteOffer(@Request() req: any, @Param('id') id: string) {
    return this.wholesale.deleteOffer(req.user.id, id);
  }
}

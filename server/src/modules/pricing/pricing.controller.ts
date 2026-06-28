import { Body, Controller, Post } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { QuoteRequestDto } from './pricing.dto';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  /**
   * Compute a live price quote for a product + customization options.
   * Public: customers preview pricing before authenticating / checking out.
   */
  @Post('quote')
  quote(@Body() dto: QuoteRequestDto) {
    return this.pricingService.quote(dto);
  }
}

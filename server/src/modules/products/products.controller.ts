import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { DEFAULT_PRODUCT_OPTIONS } from '../pricing/product-options';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /** GET /products — public catalog with optional ?wristbandType= &supplierId= &search= */
  @Get()
  browse(
    @Query('wristbandType') wristbandType?: string,
    @Query('supplierId') supplierId?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.browse({ wristbandType, supplierId, search });
  }

  // Static routes — must precede the ':id' route below.

  /** GET /products/option-defaults — starting template for a new product's option builder. */
  @Get('option-defaults')
  optionDefaults() {
    return DEFAULT_PRODUCT_OPTIONS;
  }

  /** GET /products/types — distinct wristband types across active products (data-driven, not hardcoded). */
  @Get('types')
  types() {
    return this.productsService.listWristbandTypes();
  }

  /** GET /products/:id — public product detail */
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.productsService.getById(id);
  }
}

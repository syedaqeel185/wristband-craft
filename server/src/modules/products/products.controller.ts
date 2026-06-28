import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service';

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

  /** GET /products/:id — public product detail */
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.productsService.getById(id);
  }
}

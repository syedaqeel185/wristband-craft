import { Controller, Get } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('countries')
export class CountriesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Public: active countries for registration + discovery filters. */
  @Get()
  list() {
    return this.prisma.country.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { code: true, name: true, region: true, currency: true },
    });
  }
}

@Module({
  controllers: [CountriesController],
})
export class CountriesModule {}

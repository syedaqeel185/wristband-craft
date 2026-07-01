import { Body, Controller, Delete, Get, Param, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { put } from '@vercel/blob';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { DesignsService } from './designs.service';
import { CreateDesignDto } from './designs.dto';

@Controller('designs')
@UseGuards(AuthGuard('jwt'))
export class DesignsController {
  constructor(private readonly designsService: DesignsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: any) {
    const filename = `designs/${Date.now()}-${randomUUID()}${extname(file.originalname || '.png')}`;
    const blob = await put(filename, file.buffer, { access: 'public', contentType: file.mimetype });
    return { url: blob.url };
  }

  @Post()
  create(@Request() req: any, @Body() dto: CreateDesignDto) {
    return this.designsService.create(req.user.id, dto);
  }

  @Get('mine')
  mine(@Request() req: any) {
    return this.designsService.findMine(req.user.id);
  }

  @Get('platform')
  platform(@Request() req: any) {
    return this.designsService.findPlatformView({ id: req.user.id, roles: req.user.roles || [] });
  }

  @Delete(':id')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.designsService.remove(req.user.id, id);
  }
}

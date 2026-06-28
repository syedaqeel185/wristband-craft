import { Body, Controller, Delete, Get, Param, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { DesignsService } from './designs.service';
import { CreateDesignDto } from './designs.dto';

@Controller('designs')
@UseGuards(AuthGuard('jwt'))
export class DesignsController {
  constructor(private readonly designsService: DesignsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'designs');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          cb(null, `${Date.now()}-${randomUUID()}${extname(file.originalname || '.png')}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  upload(@Request() req: any, @UploadedFile() file: any) {
    const host = req.get('host');
    const protocol = req.protocol;
    return {
      url: `${protocol}://${host}/uploads/designs/${file.filename}`,
    };
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

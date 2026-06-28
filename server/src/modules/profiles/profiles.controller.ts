import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.profilesService.findById(id);
  }

  @Post()
  create(@Body() body: { email: string; fullName?: string }) {
    return this.profilesService.create(body.email, body.fullName);
  }
}

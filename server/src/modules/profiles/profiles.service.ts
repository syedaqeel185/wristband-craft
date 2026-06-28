import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.profile.findUnique({
      where: { id },
    });
  }

  async create(email: string, fullName?: string) {
    return this.prisma.profile.create({
      data: {
        email,
        password: '',
        fullName,
      },
    });
  }
}

import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import type { RegisterDto, LoginDto, VerifyEmailDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async register(dto: RegisterDto, role: 'user' | 'supplier' = 'user') {
    const existing = await this.prisma.profile.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.profile.create({
      data: {
        email: dto.email,
        password: passwordHash,
        fullName: dto.fullName,
        countryCode: dto.countryCode?.toUpperCase(),
        isVerified: true,
      },
      include: { roles: true },
    });

    await this.prisma.userRole.create({
      data: { userId: user.id, role },
    });

    const token = this.signToken(user.id, user.email, [role]);

    return {
      success: true,
      needsVerification: false,
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: [role],
      },
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.profile.findUnique({ where: { email: dto.email } });
    if (!user) throw new BadRequestException('Invalid email');
    if (user.isVerified) throw new BadRequestException('Email already verified');
    if (user.verificationToken !== dto.otp) throw new BadRequestException('Invalid OTP code');

    await this.prisma.profile.update({
      where: { id: user.id },
      data: { isVerified: true, verificationToken: null },
    });

    const roles = await this.prisma.userRole.findMany({ where: { userId: user.id } });
    const roleNames = roles.map(r => r.role);

    const token = this.signToken(user.id, user.email, roleNames);

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles: roleNames,
      },
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.profile.findUnique({
      where: { email },
      include: { roles: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // We will check isVerified in the login method instead
    // to allow resending the OTP

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);

    const roles = user.roles.map((role) => role.role);
    const token = this.signToken(user.id, user.email, roles);

    return {
      success: true,
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles,
      },
    };
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        countryCode: true,
        createdAt: true,
        roles: {
          select: { role: true },
        },
      },
    });

    if (!profile) return null;

    return {
      ...profile,
      roles: profile.roles.map((entry) => entry.role),
    };
  }

  /** Set/update the current customer's country (for country-aware discovery). */
  async updateCountry(userId: string, countryCode: string) {
    await this.prisma.profile.update({
      where: { id: userId },
      data: { countryCode: countryCode.toUpperCase() },
    });
    return { success: true, countryCode: countryCode.toUpperCase() };
  }

  async changePassword(userId: string, newPassword: string) {
    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.profile.update({
      where: { id: userId },
      data: { password: hash },
    });
    return { success: true };
  }

  signToken(userId: string, email: string, roles: string[]) {
    return this.jwtService.sign({ sub: userId, email, roles });
  }
}

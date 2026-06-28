import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.profile.findUnique({
      where: { id: payload.sub },
      include: { roles: true },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    const { password, ...rest } = user;
    return {
      ...rest,
      roles: user.roles.map((role) => role.role),
    };
  }
}

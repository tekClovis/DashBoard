import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../core/prisma/prisma.service.js';

const BCRYPT_COST = 12;

/**
 * On boot, if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are set and no admin exists yet,
 * creates one pre-confirmed — see docs/Architecture.md §5.3.
 */
@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;

    const existingAdmin = await this.prisma.user.findFirst({ where: { role: Role.ADMIN } });
    if (existingAdmin) return;

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    await this.prisma.user.upsert({
      where: { email: normalizedEmail },
      update: { role: Role.ADMIN, passwordHash, emailVerifiedAt: new Date() },
      create: {
        email: normalizedEmail,
        passwordHash,
        role: Role.ADMIN,
        emailVerifiedAt: new Date(),
      },
    });

    this.logger.log(`Seeded admin user ${normalizedEmail}`);
  }
}

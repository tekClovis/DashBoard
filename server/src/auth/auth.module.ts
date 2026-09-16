import { Module } from '@nestjs/common';
import { AdminSeedService } from './admin-seed.service.js';
import { AuthController } from './auth.controller.js';
import { JwtGuard } from './jwt.guard.js';
import { JwtService } from './jwt.service.js';
import { VerificationService } from './verification.service.js';

@Module({
  controllers: [AuthController],
  providers: [VerificationService, JwtService, JwtGuard, AdminSeedService],
  exports: [JwtService, JwtGuard],
})
export class AuthModule {}

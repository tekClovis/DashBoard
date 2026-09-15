import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { VerificationService } from './verification.service.js';

@Module({
  controllers: [AuthController],
  providers: [VerificationService],
})
export class AuthModule {}

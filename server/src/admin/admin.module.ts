import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeGateway } from '../timer/realtime.gateway.js';
import { TimerModule } from '../timer/timer.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { USER_SOCKET_DISCONNECTOR } from './user-socket-disconnector.js';

@Module({
  imports: [AuthModule, TimerModule],
  controllers: [AdminController],
  providers: [AdminService, { provide: USER_SOCKET_DISCONNECTOR, useExisting: RealtimeGateway }],
})
export class AdminModule {}

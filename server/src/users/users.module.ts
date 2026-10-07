import { Module } from '@nestjs/common';
import { USER_SOCKET_DISCONNECTOR } from '../admin/user-socket-disconnector.js';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeGateway } from '../timer/realtime.gateway.js';
import { TimerModule } from '../timer/timer.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [AuthModule, TimerModule],
  controllers: [UsersController],
  providers: [UsersService, { provide: USER_SOCKET_DISCONNECTOR, useExisting: RealtimeGateway }],
})
export class UsersModule {}

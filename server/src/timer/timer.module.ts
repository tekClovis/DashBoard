// Socket.IO gateway + Timer + Redis-backed fetch cache — see docs/Architecture.md §6, §8.5 and
// features/timer-realtime/spec.md.
//
// The test/dev-only fake widgets (fake-widgets.ts) are registered from main.ts's real
// bootstrap, not from this module: registering them here would run on every Nest
// TestingModule that imports AppModule too (every other feature's e2e suite), polluting
// their WidgetRegistryService with entries they don't expect.

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { TokenCipherService } from '../connections/token-cipher.service.js';
import { FetchService } from './fetch.service.js';
import { InstanceLookupService } from './instance-lookup.service.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { TimerService } from './timer.service.js';

@Module({
  imports: [AuthModule, CatalogModule],
  providers: [RealtimeGateway, TimerService, FetchService, InstanceLookupService, TokenCipherService],
  exports: [RealtimeGateway],
})
export class TimerModule {}

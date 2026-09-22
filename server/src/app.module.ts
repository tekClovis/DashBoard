import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { validate } from './core/config/env.validation.js';
import { CoreModule } from './core/core.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { AuthModule } from './auth/auth.module.js';
import { OAuthModule } from './auth/oauth/oauth.module.js';
import { UsersModule } from './users/users.module.js';
import { AdminModule } from './admin/admin.module.js';
import { ConnectionsModule } from './connections/connections.module.js';
import { DashboardsModule } from './dashboards/dashboards.module.js';
import { TimerModule } from './timer/timer.module.js';
import { SteamModule } from './services/steam/steam.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env.local', '../.env'],
      validate,
    }),
    // Everything but /api/*, /about.json and /socket.io/* falls through to the built SPA.
    // See docs/Architecture.md §1.
    ServeStaticModule.forRoot({
      rootPath: join(import.meta.dirname, '..', 'public'),
      exclude: ['/api/{*splat}', '/about.json', '/socket.io/{*splat}'],
    }),
    CoreModule,
    CatalogModule,
    AuthModule,
    OAuthModule,
    UsersModule,
    AdminModule,
    ConnectionsModule,
    DashboardsModule,
    TimerModule,
    SteamModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { DashboardEventsService } from './dashboard-events.js';
import { DashboardShareService } from './dashboard-shares.service.js';
import { DashboardsController } from './dashboards.controller.js';
import { DashboardsService } from './dashboards.service.js';
import { SharesController } from './shares.controller.js';
import { WidgetsController } from './widgets.controller.js';

// Imports AuthModule for JwtGuard (like CatalogModule/ConnectionsModule) and CatalogModule for
// WidgetRegistryService. AuthController still reaches DashboardsService (for the signup hook)
// without this module appearing in AuthModule's imports — see AuthModule's comment — so this
// stays a plain DAG: DashboardsModule -> {AuthModule, CatalogModule} -> AuthModule, no cycle.
@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [DashboardsController, WidgetsController, SharesController],
  providers: [DashboardsService, DashboardShareService, DashboardEventsService],
  exports: [DashboardsService, DashboardEventsService],
})
export class DashboardsModule {}

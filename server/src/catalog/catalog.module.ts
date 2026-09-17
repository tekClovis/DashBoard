import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConnectionsModule } from '../connections/connections.module.js';
import { AboutController } from './about.controller.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { WidgetRegistryService } from './widget-registry.service.js';

@Module({
  imports: [AuthModule, ConnectionsModule],
  controllers: [AboutController, CatalogController],
  providers: [WidgetRegistryService, CatalogService],
  exports: [WidgetRegistryService],
})
export class CatalogModule {}

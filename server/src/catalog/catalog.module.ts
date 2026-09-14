import { Module } from '@nestjs/common';
import { AboutController } from './about.controller.js';
import { WidgetRegistryService } from './widget-registry.service.js';

@Module({
  controllers: [AboutController],
  providers: [WidgetRegistryService],
  exports: [WidgetRegistryService],
})
export class CatalogModule {}

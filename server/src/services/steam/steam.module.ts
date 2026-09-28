import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CatalogModule } from '../../catalog/catalog.module.js';
import { WidgetRegistryService } from '../../catalog/widget-registry.service.js';
import { createSteamWidgets } from './steam.widgets.js';

// Registers the Steam service and its widgets — see docs/Architecture.md §3 and
// features/steam-widgets/spec.md.
@Module({ imports: [CatalogModule] })
export class SteamModule implements OnModuleInit {
  constructor(
    private readonly registry: WidgetRegistryService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.registry.registerService({ name: 'steam', connection: 'openid' });
    for (const def of createSteamWidgets(this.config.get<string>('STEAM_API_KEY'))) {
      this.registry.register(def);
    }
  }
}

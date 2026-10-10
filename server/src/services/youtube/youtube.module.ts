import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { CatalogModule } from '../../catalog/catalog.module.js';
import { WidgetRegistryService } from '../../catalog/widget-registry.service.js';
import { TokenCipherService } from '../../connections/token-cipher.service.js';
import { GoogleTokenRefresher } from './google-token-refresher.js';
import { YoutubeSearchController } from './youtube-search.controller.js';
import { youtubeWidgets } from './youtube-widgets.js';

/** Registers the youtube service and its widgets with the registry — see docs/Architecture.md §8.1. */
@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [YoutubeSearchController],
  providers: [TokenCipherService, GoogleTokenRefresher],
})
export class YoutubeModule implements OnModuleInit {
  constructor(
    private readonly registry: WidgetRegistryService,
    private readonly refresher: GoogleTokenRefresher,
  ) {}

  onModuleInit(): void {
    this.registry.registerService({ name: 'youtube', connection: 'oauth' });
    for (const def of youtubeWidgets((userId) => this.refresher.refresh(userId))) this.registry.register(def);
  }
}

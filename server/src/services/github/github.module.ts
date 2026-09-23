import { Module, OnModuleInit } from '@nestjs/common';
import { CatalogModule } from '../../catalog/catalog.module.js';
import { WidgetRegistryService } from '../../catalog/widget-registry.service.js';
import { githubWidgets } from './github-widgets.js';

/** Registers the github service and its widgets with the registry — see docs/Architecture.md §3. */
@Module({ imports: [CatalogModule] })
export class GithubModule implements OnModuleInit {
  constructor(private readonly registry: WidgetRegistryService) {}

  onModuleInit(): void {
    this.registry.registerService({ name: 'github', connection: 'oauth' });
    for (const def of githubWidgets) this.registry.register(def);
  }
}

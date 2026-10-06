// Weather service (Open-Meteo, connection: 'none') — see docs/Architecture.md §3 and
// features/weather-widgets/spec.md.

import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AuthModule } from '../../auth/auth.module.js';
import { CatalogModule } from '../../catalog/catalog.module.js';
import { WidgetRegistryService } from '../../catalog/widget-registry.service.js';
import { REDIS } from '../../core/redis/redis.provider.js';
import { Geocoder } from './open-meteo.js';
import { WeatherController } from './weather.controller.js';
import { weatherWidgets } from './weather.widgets.js';

@Module({ imports: [AuthModule, CatalogModule], controllers: [WeatherController] })
export class WeatherModule implements OnModuleInit {
  constructor(
    private readonly registry: WidgetRegistryService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.registry.registerService({ name: 'weather', connection: 'none' });
    for (const def of weatherWidgets(new Geocoder(this.redis))) this.registry.register(def);
  }
}

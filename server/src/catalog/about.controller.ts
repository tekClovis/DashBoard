import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { AboutResponse } from '@dashboard/shared';
import { clientAddress } from '../core/http/client-address.js';
import { WidgetRegistryService } from './widget-registry.service.js';

/** GET /about.json — public, not under /api. See docs/Architecture.md §3. */
@Controller()
export class AboutController {
  constructor(private readonly registry: WidgetRegistryService) {}

  @Get('about.json')
  get(@Req() req: Request): AboutResponse {
    return {
      client: {
        host: clientAddress(req),
      },
      server: {
        current_time: Math.floor(Date.now() / 1000),
        services: this.registry.services().map((service) => ({
          name: service.name,
          widgets: service.widgets.map((widget) => ({
            name: widget.name,
            description: widget.description,
            params: widget.params.map((param) => ({ name: param.name, type: param.type })),
          })),
        })),
      },
    };
  }
}

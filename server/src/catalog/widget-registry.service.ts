import { Injectable } from '@nestjs/common';
import type { ServiceSpec, WidgetSpec } from '@dashboard/shared';
import type { WidgetDefinition } from './widget-definition.js';

interface ServiceMeta {
  name: string;
  connection: ServiceSpec['connection'];
}

/**
 * The single source of truth for /about.json, /api/catalog, param
 * validation, and the Timer. Each `services/<name>` module registers its
 * ServiceSpec and WidgetDefinitions in onModuleInit. See
 * docs/Architecture.md §3.
 */
@Injectable()
export class WidgetRegistryService {
  private readonly serviceMeta = new Map<string, ServiceMeta>();
  private readonly definitions = new Map<string, WidgetDefinition>();

  registerService(meta: ServiceMeta): void {
    if (this.serviceMeta.has(meta.name)) {
      throw new Error(`Service '${meta.name}' is already registered.`);
    }
    this.serviceMeta.set(meta.name, meta);
  }

  register(def: WidgetDefinition): void {
    if (!this.serviceMeta.has(def.service)) {
      throw new Error(`Service '${def.service}' must be registered before its widgets.`);
    }
    if (def.params.length === 0) {
      throw new Error(`Widget '${def.service}.${def.name}' must declare at least one param.`);
    }
    const key = `${def.service}.${def.name}`;
    if (this.definitions.has(key)) {
      throw new Error(`Widget '${key}' is already registered.`);
    }
    this.definitions.set(key, def);
  }

  /** Full ServiceSpec[], for /api/catalog and the Timer. */
  services(): ServiceSpec[] {
    return [...this.serviceMeta.values()].map((meta) => ({
      ...meta,
      widgets: this.widgetSpecsFor(meta.name),
    }));
  }

  get(service: string, widget: string): WidgetDefinition | undefined {
    return this.definitions.get(`${service}.${widget}`);
  }

  private widgetSpecsFor(service: string): WidgetSpec[] {
    return [...this.definitions.values()]
      .filter((def) => def.service === service)
      .map((def) => ({
        service: def.service,
        name: def.name,
        description: def.description,
        params: def.params,
        minRefreshSec: def.minRefreshSec,
      }));
  }
}

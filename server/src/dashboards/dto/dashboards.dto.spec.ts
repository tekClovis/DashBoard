import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateDashboardDto } from './create-dashboard.dto.js';
import { CreateWidgetInstanceDto } from './create-widget-instance.dto.js';
import { LayoutUpdateDto } from './layout-update.dto.js';
import { ShareDashboardDto } from './share-dashboard.dto.js';
import { UpdateDashboardDto } from './update-dashboard.dto.js';
import { UpdateWidgetInstanceDto } from './update-widget-instance.dto.js';

/**
 * Validates like main.ts's global ValidationPipe and returns the names of the offending properties.
 * LayoutUpdateDto is validated by the controller's ParseArrayPipe instead, which does not whitelist,
 * so no undeclared-field case is asserted for it.
 */
async function invalidProperties(dto: new () => object, body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(dto, body), { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((error) => error.property);
}

const position = { x: 0, y: 1, w: 2, h: 3 };
const widgetBody = { service: 'fake', widget: 'echo', params: { label: 'hello' }, refreshRate: 120, ...position };
const layoutEntry = { id: '3f2b7c1e-8a4d-4e5f-9b6a-1c2d3e4f5a6b', ...position };

describe('CreateDashboardDto', () => {
  it.each([['a'], ['x'.repeat(100)]])('accepts a name of allowed length (%#)', async (name) => {
    expect(await invalidProperties(CreateDashboardDto, { name })).toEqual([]);
  });

  it.each([
    ['missing', {}],
    ['empty', { name: '' }],
    ['longer than 100 characters', { name: 'x'.repeat(101) }],
    ['not a string', { name: 42 }],
  ])('rejects a name that is %s', async (_label, body) => {
    expect(await invalidProperties(CreateDashboardDto, body)).toEqual(['name']);
  });

  it('rejects an undeclared field', async () => {
    expect(await invalidProperties(CreateDashboardDto, { name: 'Home', position: 3 })).toEqual(['position']);
  });
});

describe('UpdateDashboardDto', () => {
  it.each([
    ['an empty body', {}],
    ['only a name', { name: 'Renamed' }],
    ['only a position', { position: 0 }],
    ['both fields', { name: 'x'.repeat(100), position: 12 }],
  ])('accepts %s', async (_label, body) => {
    expect(await invalidProperties(UpdateDashboardDto, body)).toEqual([]);
  });

  it.each([
    ['an empty name', { name: '' }, 'name'],
    ['a name longer than 100 characters', { name: 'x'.repeat(101) }, 'name'],
    ['a non-string name', { name: 42 }, 'name'],
    ['a negative position', { position: -1 }, 'position'],
    ['a fractional position', { position: 1.5 }, 'position'],
    ['a numeric-string position', { position: '1' }, 'position'],
    ['an undeclared field', { name: 'Renamed', userId: 'u2' }, 'userId'],
  ])('rejects %s', async (_label, body, property) => {
    expect(await invalidProperties(UpdateDashboardDto, body)).toEqual([property]);
  });
});

describe('CreateWidgetInstanceDto', () => {
  it('accepts a complete body', async () => {
    expect(await invalidProperties(CreateWidgetInstanceDto, widgetBody)).toEqual([]);
  });

  it.each(Object.keys(widgetBody))('rejects a body missing %s', async (property) => {
    const { [property]: _omitted, ...body } = widgetBody as Record<string, unknown>;

    expect(await invalidProperties(CreateWidgetInstanceDto, body)).toEqual([property]);
  });

  it.each([
    ['a non-string service', { service: 1 }, 'service'],
    ['a non-string widget', { widget: 1 }, 'widget'],
    ['string params', { params: 'label=hello' }, 'params'],
    ['array params', { params: ['hello'] }, 'params'],
    ['null params', { params: null }, 'params'],
    ['a fractional refreshRate', { refreshRate: 60.5 }, 'refreshRate'],
    ['a numeric-string refreshRate', { refreshRate: '120' }, 'refreshRate'],
    ['a fractional x', { x: 0.5 }, 'x'],
    ['a numeric-string y', { y: '1' }, 'y'],
    ['a fractional w', { w: 2.5 }, 'w'],
    ['a null h', { h: null }, 'h'],
    ['an undeclared field', { dashboardId: 'd2' }, 'dashboardId'],
  ])('rejects %s', async (_label, override, property) => {
    expect(await invalidProperties(CreateWidgetInstanceDto, { ...widgetBody, ...override })).toEqual([property]);
  });
});

describe('UpdateWidgetInstanceDto', () => {
  it.each([
    ['an empty body', {}],
    ['only params', { params: { label: 'changed' } }],
    ['only a refreshRate', { refreshRate: 300 }],
    ['both fields', { params: {}, refreshRate: 300 }],
  ])('accepts %s', async (_label, body) => {
    expect(await invalidProperties(UpdateWidgetInstanceDto, body)).toEqual([]);
  });

  it.each([
    ['string params', { params: 'label=hello' }, 'params'],
    ['array params', { params: ['hello'] }, 'params'],
    ['a fractional refreshRate', { refreshRate: 60.5 }, 'refreshRate'],
    ['a numeric-string refreshRate', { refreshRate: '300' }, 'refreshRate'],
    ['a layout field, which only PATCH /layout may change', { x: 4 }, 'x'],
    ['an attempt to retarget the widget', { refreshRate: 300, widget: 'other' }, 'widget'],
  ])('rejects %s', async (_label, body, property) => {
    expect(await invalidProperties(UpdateWidgetInstanceDto, body)).toEqual([property]);
  });
});

describe('LayoutUpdateDto', () => {
  it('accepts a uuid id with integer coordinates', async () => {
    expect(await invalidProperties(LayoutUpdateDto, layoutEntry)).toEqual([]);
  });

  it.each(Object.keys(layoutEntry))('rejects an entry missing %s', async (property) => {
    const { [property]: _omitted, ...body } = layoutEntry as Record<string, unknown>;

    expect(await invalidProperties(LayoutUpdateDto, body)).toEqual([property]);
  });

  it.each([
    ['a non-uuid id', { id: 'w1' }, 'id'],
    ['a numeric id', { id: 7 }, 'id'],
    ['a fractional x', { x: 0.5 }, 'x'],
    ['a numeric-string w', { w: '2' }, 'w'],
  ])('rejects %s', async (_label, override, property) => {
    expect(await invalidProperties(LayoutUpdateDto, { ...layoutEntry, ...override })).toEqual([property]);
  });
});

describe('ShareDashboardDto', () => {
  it('accepts an email', async () => {
    expect(await invalidProperties(ShareDashboardDto, { email: 'grace@example.com' })).toEqual([]);
  });

  it.each([[{}], [{ email: 'grace' }], [{ email: 'a@b.co', extra: 1 }]])('rejects %j', async (body) => {
    expect((await invalidProperties(ShareDashboardDto, body)).length).toBeGreaterThan(0);
  });
});

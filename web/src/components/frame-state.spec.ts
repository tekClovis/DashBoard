import type { WidgetErrorCode } from '@dashboard/shared';
import { describe, expect, it } from 'vitest';
import type { WidgetCacheEntry } from '@/realtime/useWidgetData.js';
import { errorCopy, frameState } from './frame-state.js';

const NOW = new Date(2026, 9, 1, 14, 28).getTime();
const at = (secondsAgo: number) => new Date(NOW - secondsAgo * 1000).toISOString();
const entry = (over: Partial<WidgetCacheEntry> = {}): WidgetCacheEntry => ({
  data: { n: 1 },
  fetchedAt: at(9),
  error: null,
  ...over,
});
const err = (code: WidgetErrorCode, retryAt?: string) => ({ code, message: 'm', retryAt });

describe('frameState (first match wins)', () => {
  it.each<WidgetErrorCode>(['NOT_CONNECTED', 'REAUTH_REQUIRED', 'RATE_LIMITED'])(
    '%s is warn, even with no data and the socket down',
    (code) => {
      expect(frameState(entry({ error: err(code), fetchedAt: null }), false, 60, NOW)).toBe('warn');
    },
  );

  it.each<WidgetErrorCode>(['UPSTREAM_ERROR', 'INVALID_PARAMS'])('%s is error, ahead of loading and paused', (code) => {
    expect(frameState(entry({ error: err(code), fetchedAt: null }), false, 60, NOW)).toBe('error');
  });

  it('is loading before the first data, even with the socket down', () => {
    expect(frameState(undefined, false, 60, NOW)).toBe('loading');
    expect(frameState(entry({ fetchedAt: null }), false, 60, NOW)).toBe('loading');
  });

  it('is paused when the socket is down, ahead of stale', () => {
    expect(frameState(entry({ fetchedAt: at(3600) }), false, 60, NOW)).toBe('paused');
  });

  it('is stale only past twice the refresh interval', () => {
    expect(frameState(entry({ fetchedAt: at(121) }), true, 60, NOW)).toBe('stale');
    expect(frameState(entry({ fetchedAt: at(120) }), true, 60, NOW)).toBe('live');
  });

  it('is live otherwise', () => {
    expect(frameState(entry(), true, 60, NOW)).toBe('live');
  });
});

describe('errorCopy', () => {
  const ctx = { service: 'GitHub', now: NOW };

  it('NOT_CONNECTED asks to connect the service from Services', () => {
    expect(errorCopy(err('NOT_CONNECTED'), ctx)).toEqual({
      title: 'GitHub isn’t connected',
      body: 'Connect it to start receiving data.',
      meta: 'not connected',
      action: { to: 'services', label: 'Connect GitHub' },
    });
  });

  it('REAUTH_REQUIRED asks to reconnect and says settings are kept', () => {
    expect(errorCopy(err('REAUTH_REQUIRED'), ctx)).toEqual({
      title: 'GitHub access expired',
      body: 'Reconnect to resume updates. Your widget settings are kept.',
      meta: 'reconnect',
      action: { to: 'services', label: 'Reconnect GitHub' },
    });
  });

  it('RATE_LIMITED gives the next attempt from retryAt', () => {
    const copy = errorCopy(err('RATE_LIMITED', new Date(NOW + 4 * 60_000).toISOString()), ctx);
    expect(copy).toEqual({
      title: 'GitHub rate limit reached',
      body: 'Next attempt at 14:32, in 4m.',
      meta: 'retry 4m',
    });
  });

  it('RATE_LIMITED without retryAt still says it retries', () => {
    expect(errorCopy(err('RATE_LIMITED'), ctx)).toMatchObject({ body: 'Retrying automatically.', meta: 'retry' });
  });

  it('UPSTREAM_ERROR says the service didn’t respond and retries', () => {
    expect(errorCopy(err('UPSTREAM_ERROR'), ctx)).toEqual({
      title: 'GitHub didn’t respond',
      body: 'Retrying automatically.',
      meta: 'failed',
    });
    expect(errorCopy(err('UPSTREAM_ERROR', new Date(NOW + 120_000).toISOString()), ctx).body).toBe(
      'Retrying automatically. Next attempt at 14:30.',
    );
  });

  it('INVALID_PARAMS on weather names the city and opens Configure', () => {
    expect(errorCopy(err('INVALID_PARAMS'), { service: 'Weather', city: 'Pariss', now: NOW })).toEqual({
      title: 'City not found',
      body: 'No results for “Pariss”. Check the city name.',
      meta: 'fix settings',
      action: { to: 'configure', label: 'Configure' },
    });
  });

  it('INVALID_PARAMS elsewhere says the settings were rejected', () => {
    expect(errorCopy(err('INVALID_PARAMS'), ctx)).toMatchObject({
      title: 'Settings rejected',
      body: 'The service rejected these settings. Check them and save again.',
      meta: 'fix settings',
      action: { to: 'configure', label: 'Configure' },
    });
  });
});

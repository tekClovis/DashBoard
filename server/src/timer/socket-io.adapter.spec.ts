import { createServer } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { ServerOptions } from 'socket.io';
import { SocketIoAdapter } from './socket-io.adapter.js';

const APP_URL = 'https://app.example.test';

/** IoAdapter accepts a bare http.Server in place of the Nest app; it is never listened on. */
function makeAdapter(): SocketIoAdapter {
  return new SocketIoAdapter(createServer() as unknown as INestApplicationContext, APP_URL);
}

describe('SocketIoAdapter', () => {
  it('pins CORS to APP_URL with credentials, overriding a permissive gateway option', async () => {
    const server = makeAdapter().createIOServer(0, { cors: { origin: true } } as ServerOptions);

    expect(server.engine.opts.cors).toEqual({ origin: APP_URL, credentials: true });
    await server.close();
  });

  it('pins CORS when the gateway passes no options, and keeps the other options it does pass', async () => {
    const adapter = makeAdapter();
    const bare = adapter.createIOServer(0);
    const custom = adapter.createIOServer(0, { path: '/realtime' } as ServerOptions);

    expect(bare.engine.opts.cors).toEqual({ origin: APP_URL, credentials: true });
    expect(custom.path()).toBe('/realtime');
    expect(custom.engine.opts.cors).toEqual({ origin: APP_URL, credentials: true });
    await bare.close();
    await custom.close();
  });
});

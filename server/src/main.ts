import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { WidgetRegistryService } from './catalog/widget-registry.service.js';
import { registerFakeWidgets } from './timer/fake-widgets.js';
import { SocketIoAdapter } from './timer/socket-io.adapter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api', { exclude: ['about.json'] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  // RealtimeGateway (docs/Architecture.md §6) needs the Socket.IO adapter, not Nest's ws default.
  // SocketIoAdapter (not the plain IoAdapter) pins the handshake's CORS origin to APP_URL — see
  // its own comment for why RealtimeGateway's decorator can't do this itself.
  app.useWebSocketAdapter(new SocketIoAdapter(app, app.get(ConfigService).getOrThrow<string>('APP_URL')));

  // No real service module exists yet (server/src/services/* — see
  // features/timer-realtime/spec.md's Constraints), so register fake WidgetDefinitions to
  // exercise the realtime pipeline end to end outside production. Real definitions register
  // the same way, with no changes needed here.
  if (process.env['NODE_ENV'] !== 'production') {
    registerFakeWidgets(app.get(WidgetRegistryService));
  }

  app.enableShutdownHooks();

  await app.listen(8080);
}
await bootstrap();

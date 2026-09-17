import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Needed to read the session cookie and the OAuth CSRF double-submit
  // cookie (connections-api). auth-session/oauth-login aren't merged yet,
  // so this registration doesn't already exist elsewhere.
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['about.json'] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();

  await app.listen(8080);
}
await bootstrap();

import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true buffers the raw request body (needed for Stripe webhook
  // signature verification) without disturbing the JSON parser for other routes.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({
    origin: true,
    credentials: true,
  });
  // Designs carry a Fabric canvas JSON with embedded (base64) logos, so the
  // default 100kb JSON limit is far too small — raise it to avoid HTTP 413.
  app.use(json({ limit: '30mb' }));
  app.use(urlencoded({ extended: true, limit: '30mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

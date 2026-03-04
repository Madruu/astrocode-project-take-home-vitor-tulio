import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const extraOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
  const allowedOrigins = new Set([
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    process.env.PAYPAL_FRONTEND_URL?.replace(/\/account\/?$/, ''),
    process.env.MP_FRONTEND_URL?.replace(/\/account\/?$/, ''),
    ...extraOrigins,
  ]);
  const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_DEPLOYMENT_ID);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      // On Railway: allow all origins (Vercel preview URLs, custom domains, etc.)
      if (isRailway) {
        callback(null, true);
        return;
      }
      if (
        allowedOrigins.has(origin) ||
        /^https:\/\/.+\.ngrok-free\.dev$/.test(origin) ||
        /^https:\/\/.+\.vercel\.app$/.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Astrocode API')
    .setDescription('API documentation for Astrocode backend')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import session from 'express-session';
import { AppModule } from './app/app.module';
import { corsOptions } from './config/cors.config';
import { sessionConfig } from './config/session.config';

// OpenTelemetry SDK — hiện đang tắt, xem setup.md mục Development mode.
// import { NodeSDK } from '@opentelemetry/sdk-node';
// const otelSdk = new NodeSDK({ ... });
// otelSdk.start();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  const version = process.env.VERSION;
  app.setGlobalPrefix(`api/${version}`);

  app.enableCors(corsOptions());
  app.use(session(sessionConfig()));

  const trustProxyCount = parseInt(process.env.TRUST_PROXY_COUNT ?? '0', 10);
  if (trustProxyCount > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyCount);
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Warehouse API')
    .setDescription('Warehouse API documentation')
    .setVersion(process.env.VERSION ?? '1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/api-docs', app, document, {
    jsonDocumentUrl: 'swagger.json',
  });

  const port = process.env.PORT ?? 8085;
  await app.listen(port);
}

bootstrap();

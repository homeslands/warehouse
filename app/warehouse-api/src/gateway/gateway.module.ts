import {
  DynamicModule,
  INestApplication,
  Logger,
  MiddlewareConsumer,
  Module,
  NestModule,
  Provider,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { StorageGrpcClient } from 'src/grpc/gateway/storage-grpc.client';
import { Clock, systemClock } from 'src/session/session.policy';
import { GatewayAuthController } from './auth/gateway-auth.controller';
import { GatewayAuthService } from './auth/gateway-auth.service';
import { GatewayConfig, readGatewayConfig } from './gateway.config';
import { GATEWAY_CLOCK, GATEWAY_CONFIG, GATEWAY_V1_PREFIX } from './gateway.constants';
import { GatewayRequestContextMiddleware } from './gateway-request';
import { GatewayV1ExceptionFilter } from './gateway-v1-exception.filter';
// Guard trùng mã lỗi v1 ↔ legacy chạy khi nạp module (DEV-197-04).
import './v1-error-codes';

function gatewayProviders(configProvider: Provider, clock: Clock): Provider[] {
  return [
    configProvider,
    { provide: GATEWAY_CLOCK, useValue: clock },
    {
      provide: StorageGrpcClient,
      inject: [GATEWAY_CONFIG],
      useFactory: (config: GatewayConfig) => new StorageGrpcClient(config.storage),
    },
    { provide: Logger, useValue: new Logger('GatewayV1') },
    GatewayAuthService,
    { provide: APP_FILTER, useClass: GatewayV1ExceptionFilter },
  ];
}

/**
 * Composition root Gateway v1 (W02 I-02b; architecture: Gateway sở hữu HTTP/CORS/CSRF/cookie/validation biên/
 * mapping/traceId). KHÔNG import TypeORM, repository hay module nghiệp vụ legacy: mọi dữ liệu đi qua
 * `StorageGrpcClient` (gRPC mTLS). Không gắn vào `AppModule` vì `/api/v1` trùng prefix legacy `api/v1`.
 * - `fromEnvironment()`: process Gateway thật (`gateway.main.ts`), cấu hình qua ConfigService, validate
 *   fail-closed (`readGatewayConfig`).
 * - `forConfig()`: dựng với cấu hình đã có (test e2e/loopback), có thể inject đồng hồ.
 */
@Module({})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(GatewayRequestContextMiddleware).forRoutes('*');
  }

  static forConfig(config: GatewayConfig, clock: Clock = systemClock): DynamicModule {
    return {
      module: GatewayModule,
      controllers: [GatewayAuthController],
      providers: gatewayProviders({ provide: GATEWAY_CONFIG, useValue: config }, clock),
    };
  }

  static fromEnvironment(): DynamicModule {
    return {
      module: GatewayModule,
      imports: [ConfigModule.forRoot({ cache: true })],
      controllers: [GatewayAuthController],
      providers: gatewayProviders(
        { provide: GATEWAY_CONFIG, inject: [ConfigService], useFactory: readGatewayConfig },
        systemClock,
      ),
    };
  }
}

/**
 * Cấu hình app Express của Gateway (dùng chung cho bootstrap và e2e): prefix `/api/v1`, `trust proxy` theo
 * cấu hình (nguồn IP client), CORS chỉ các origin trong allowlist + `credentials` (business-rules §21: không
 * wildcard CORS credentials), tắt `x-powered-by`.
 */
export function configureGatewayApp(app: INestApplication, config: GatewayConfig): void {
  const express = app as NestExpressApplication;
  express.setGlobalPrefix(GATEWAY_V1_PREFIX);
  express.disable('x-powered-by');
  if (config.trustProxy !== undefined) express.set('trust proxy', config.trustProxy);
  express.enableCors({ origin: config.origins, credentials: true });
}

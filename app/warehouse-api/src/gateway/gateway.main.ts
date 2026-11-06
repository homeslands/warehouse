import { NestFactory } from '@nestjs/core';
import { GatewayConfig } from './gateway.config';
import { GATEWAY_CONFIG } from './gateway.constants';
import { configureGatewayApp, GatewayModule } from './gateway.module';

/** Cổng mặc định của Gateway v1 khi không cấu hình `GATEWAY_PORT` (khác 8085 của legacy). */
const DEFAULT_GATEWAY_PORT = 8086;

/**
 * Bootstrap process Gateway v1 (W02 I-02b) — tách khỏi `src/main.ts` legacy. Chạy: `node dist/gateway/gateway.main`.
 * Cấu hình sai/thiếu ⇒ `readGatewayConfig` ném lỗi, process không khởi động (fail-closed). Chưa có script npm
 * (package.json ngoài ownership) và chưa deploy (I-07).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(GatewayModule.fromEnvironment());
  const config = app.get<GatewayConfig>(GATEWAY_CONFIG);
  configureGatewayApp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.port ?? DEFAULT_GATEWAY_PORT);
}

// [BE-TYPE-03] `void` đánh dấu bỏ qua có chủ ý; lỗi khởi động là unhandled rejection ⇒ process thoát.
void bootstrap();

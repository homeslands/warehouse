import { utilities, WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';
import { DataSource } from 'typeorm';
import { DatabaseTransport } from 'src/logger/database.transport';

// OpenTelemetry transport (OTEL_LGTM_URL/TRACING_URL) hiện đang tắt —
// bật lại khi collector sẵn sàng, xem setup.md mục Development mode / main.ts.
export function createWinstonLogger(dataSource: DataSource): WinstonModuleOptions {
  return {
    format: winston.format.timestamp(),
    transports: [
      new winston.transports.Console({
        format: utilities.format.nestLike('warehouse-api', { colors: true, prettyPrint: true }),
      }),
      new DatabaseTransport(dataSource),
    ],
  };
}

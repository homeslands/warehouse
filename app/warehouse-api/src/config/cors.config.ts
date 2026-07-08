import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

export function corsOptions(): CorsOptions {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (!allowedOrigins) {
    throw new Error('ALLOWED_ORIGINS is not set — required for CORS whitelist');
  }

  return {
    origin: allowedOrigins.split(','),
    credentials: true,
  };
}

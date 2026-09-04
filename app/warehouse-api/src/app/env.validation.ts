import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Provision = 'provision',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsInt()
  PORT: number;

  @IsNotEmpty()
  VERSION: string;

  @IsNotEmpty()
  DATABASE_HOST: string;

  @IsInt()
  DATABASE_PORT: number;

  @IsNotEmpty()
  DATABASE_USERNAME: string;

  @IsNotEmpty()
  DATABASE_PASSWORD: string;

  @IsNotEmpty()
  DATABASE_NAME: string;

  @IsInt()
  @Min(10)
  @Max(12)
  SALT_ROUNDS: number;

  @IsInt()
  DURATION: number;

  @IsInt()
  REFRESHABLE_DURATION: number;

  // Auth lưu refresh token trên Redis nên thiếu 2 biến này là app không đăng nhập được —
  // fail ngay lúc boot tốt hơn fail lúc user login.
  @IsNotEmpty()
  REDIS_HOST: string;

  @IsInt()
  REDIS_PORT: number;

  // Có default trong code, để @IsOptional() cho .env đang chạy không phải khai thêm.
  @IsOptional()
  @IsInt()
  REDIS_AUTH_DB?: number;

  @IsOptional()
  @IsInt()
  REFRESH_TOKEN_ABSOLUTE_DURATION?: number;

  @IsOptional()
  @IsInt()
  REFRESH_TOKEN_GRACE_PERIOD?: number;

  @IsOptional()
  @IsInt()
  MAX_ACTIVE_SESSIONS?: number;

  @IsNotEmpty()
  SESSION_SECRET: string;

  @IsNotEmpty()
  JWT_SECRET: string;

  @IsNotEmpty()
  MAIL_HOST: string;

  @IsNotEmpty()
  MAIL_USER: string;

  @IsNotEmpty()
  MAIL_PASSWORD: string;

  @IsNotEmpty()
  MAIL_FROM: string;

  @IsNotEmpty()
  GOOGLE_MAP_API_URL: string;

  @IsNotEmpty()
  GOOGLE_MAPS_API_KEY: string;

  @IsNotEmpty()
  FIREBASE_PROJECT_ID: string;

  @IsNotEmpty()
  FIREBASE_CLIENT_EMAIL: string;

  @IsNotEmpty()
  FIREBASE_PRIVATE_KEY: string;

  @IsString()
  @IsNotEmpty()
  ALLOWED_ORIGINS: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}

import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisService } from './redis.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      // DB riêng cho auth, tách khỏi DB mà BullMQ dùng — FLUSHDB khi bảo trì queue
      // sẽ không đăng xuất toàn bộ user.
      useFactory: (configService: ConfigService) =>
        new Redis({
          host: configService.get<string>('REDIS_HOST'),
          port: parseInt(configService.get<string>('REDIS_PORT') ?? '6379', 10),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          db: parseInt(configService.get<string>('REDIS_AUTH_DB') ?? '1', 10),
          retryStrategy: (times: number) => Math.min(times * 100, 3000),
        }),
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}

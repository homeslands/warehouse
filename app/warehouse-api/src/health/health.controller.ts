import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckError,
  HealthIndicatorResult,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { Public } from 'src/auth/decorator/public.decorator';
import { RedisService } from 'src/redis/redis.service';

@ApiTags('Healthcheck')
@Controller('health')
@ApiExcludeController(true)
export class HealthController {
  private readonly version: string = this.configService.get<string>('VERSION');

  constructor(
    private readonly healthCheckService: HealthCheckService,
    private httpHealthIndicator: HttpHealthIndicator,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  // Deny-list thu hồi token nằm trên Redis và được check fail-closed ở mọi request có JWT:
  // Redis chết là toàn bộ API 401. Healthcheck phải phản ánh điều đó thay vì báo xanh.
  private async checkRedis(): Promise<HealthIndicatorResult> {
    try {
      await this.redisService.ping();
      return { redis: { status: 'up' } };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Redis is unreachable';
      throw new HealthCheckError('Redis check failed', { redis: { status: 'down', message } });
    }
  }

  @Get()
  @HealthCheck()
  @Public()
  check() {
    return this.healthCheckService.check([
      () =>
        this.httpHealthIndicator.pingCheck(
          'warehouse-api',
          `http://localhost:${this.configService.get<string>('PORT')}/api/${this.version}/hello`,
        ),
      () => this.checkRedis(),
    ]);
  }
}

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AutomapperModule } from '@automapper/nestjs';
import { classes } from '@automapper/classes';
import { ClsModule } from 'nestjs-cls';
import { join } from 'path';

import databaseConfig from 'src/config/database.config';
import { validate } from './env.validation';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpExceptionFilter } from './http-exception.filter';
import { AppSubscriber } from './app.subscriber';

import { JwtOptionalAuthGuard } from 'src/auth/passport/jwt/jwt-optional-auth.guard';
import { AuthorityGuard } from 'src/role/role.guard';
import { RoleBasedSerializationInterceptor } from 'src/role/role.interceptor';
import { FeatureGuard } from 'src/feature-flag-system/guard/fureture.guard';
import { FeatureFlagSystemModule } from 'src/feature-flag-system/feature-flag-system.module';

import { LoggerMiddleware } from 'src/logger/logger.middleware';
import { LoggerModule } from 'src/logger/logger.module';

import { AuthModule } from 'src/auth/auth.module';
import { RoleModule } from 'src/role/role.module';
import { AuthorityModule } from 'src/authority/authority.module';
import { AuthorityGroupModule } from 'src/authority-group/authority-group.module';
import { PermissionModule } from 'src/permission/permission.module';
import { ExampleModule } from 'src/example/example.module';
import { UserModule } from 'src/user/user.module';
import { DbModule } from 'src/db/db.module';
import { HealthModule } from 'src/health/health.module';
import { FileModule } from 'src/file/file.module';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => databaseConfig(),
    }),
    AutomapperModule.forRoot({ strategyInitializer: classes() }),
    LoggerModule,
    ScheduleModule.forRoot(),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST,
          port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
          password: process.env.REDIS_PASSWORD || undefined,
          retryStrategy: (times: number) => (times > 10 ? null : Math.min(times * 100, 3000)),
        },
        prefix: 'warehouse-bull',
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }]),
    ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', '..', 'public') }),
    FeatureFlagSystemModule,
    RoleModule,
    AuthorityGroupModule,
    AuthorityModule,
    PermissionModule,
    AuthModule,
    ExampleModule,
    UserModule,
    DbModule,
    HealthModule,
    FileModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AppSubscriber,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: JwtOptionalAuthGuard },
    { provide: APP_GUARD, useClass: AuthorityGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
    { provide: APP_INTERCEPTOR, useClass: RoleBasedSerializationInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}

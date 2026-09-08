import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthUtils } from './auth.utils';
import { JwtStrategy } from './passport/jwt/jwt.strategy';
import { RootUserSeeder } from './root-user.seeder';
import { TokenRevocationModule } from './token-revocation.module';
import { RedisModule } from 'src/redis/redis.module';
import { UserModule } from 'src/user/user.module';
import { RoleModule } from 'src/role/role.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
    UserModule,
    RoleModule,
    RedisModule,
    TokenRevocationModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthUtils, JwtStrategy, RootUserSeeder],
  exports: [AuthService],
})
export class AuthModule {}

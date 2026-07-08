import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from 'src/user/user.entity';
import { Role } from 'src/role/role.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthUtils } from './auth.utils';
import { JwtStrategy } from './passport/jwt/jwt.strategy';
import { RootUserSeeder } from './root-user.seeder';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthUtils, JwtStrategy, RootUserSeeder],
  exports: [AuthService],
})
export class AuthModule {}

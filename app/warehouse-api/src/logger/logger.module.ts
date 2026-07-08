import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WinstonModule } from 'nest-winston';
import { DataSource } from 'typeorm';
import { createWinstonLogger } from 'src/config/logger.config';
import { LoggerEntry } from './logger.entity';
import { LoggerService } from './logger.service';
import { LoggerController } from './logger.controller';
import { LoggerProfile } from './logger.mapper';
import { LoggerScheduler } from './logger.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([LoggerEntry]),
    WinstonModule.forRootAsync({
      useFactory: (dataSource: DataSource) => createWinstonLogger(dataSource),
      inject: [DataSource],
    }),
  ],
  controllers: [LoggerController],
  providers: [LoggerService, LoggerProfile, LoggerScheduler],
})
export class LoggerModule {}

import { Inject, Injectable, Logger as NestLogger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import moment from 'moment';
import { LoggerEntry } from './logger.entity';

@Injectable()
export class LoggerScheduler {
  constructor(
    @InjectRepository(LoggerEntry) private readonly loggerRepository: Repository<LoggerEntry>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: NestLogger,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_11PM)
  async handleDeleteLogs() {
    const context = `${LoggerScheduler.name}.${this.handleDeleteLogs.name}`;
    const dateOfLastWeek = moment().subtract(1, 'weeks').toDate();

    const deleteResult = await this.loggerRepository.delete({
      createdAt: LessThan(dateOfLastWeek),
    });

    this.logger.log(`Deleted ${deleteResult.affected || 0} logs older than ${dateOfLastWeek}`, context);
    return deleteResult.affected || 0;
  }
}

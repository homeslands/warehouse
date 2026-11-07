import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { LoggerEntry } from './logger.entity';
import { GetLoggerRequestDto, LoggerResponseDto } from './logger.dto';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { toPaginatedResponse } from 'src/shared/utils/pagination.util';

@Injectable()
export class LoggerService {
  constructor(
    @InjectRepository(LoggerEntry) private readonly loggerRepository: Repository<LoggerEntry>,
    @InjectMapper() private readonly mapper: Mapper,
  ) {}

  async getAllLogs(
    query: GetLoggerRequestDto,
  ): Promise<AppPaginatedResponseDto<LoggerResponseDto>> {
    const [logs, total] = await this.loggerRepository.findAndCount({
      where: query.level ? { level: query.level } : {},
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    });

    return toPaginatedResponse(
      this.mapper.mapArray(logs, LoggerEntry, LoggerResponseDto),
      total,
      query,
    );
  }
}

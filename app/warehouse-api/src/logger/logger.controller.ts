import { Controller, Get, HttpStatus, Query, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoggerService } from './logger.service';
import { GetLoggerRequestDto, LoggerResponseDto } from './logger.dto';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { ApiPaginatedResponse } from 'src/app/app.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { RequireAuthority } from 'src/authority/authority.decorator';

@ApiTags('Logger')
@ApiBearerAuth()
@Controller('logger')
export class LoggerController {
  constructor(private readonly loggerService: LoggerService) {}

  @Get()
  @RequireAuthority(AuthorityCode.LoggerRead)
  @ApiOperation({ summary: 'Get all logs (paginated)' })
  @ApiPaginatedResponse(LoggerResponseDto, 'All logs have been retrieved successfully')
  async getAllLogs(
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: GetLoggerRequestDto,
  ): Promise<AppResponseDto<AppPaginatedResponseDto<LoggerResponseDto>>> {
    const result = await this.loggerService.getAllLogs(query);
    return {
      message: 'All logs have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<LoggerResponseDto>>;
  }
}

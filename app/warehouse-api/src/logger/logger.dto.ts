import { AutoMap } from '@automapper/classes';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';

export class LoggerResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  level: string;

  @AutoMap()
  @ApiProperty()
  message: string;

  @AutoMap()
  @ApiProperty()
  context: string;

  @AutoMap()
  @ApiProperty()
  timestamp: string;

  @AutoMap()
  @ApiProperty()
  pid: number;
}

export class GetLoggerRequestDto extends BaseQueryDto {
  @AutoMap()
  @ApiProperty({
    example: 'info',
    description: 'Log level',
    enum: ['info', 'warn', 'error', 'debug'],
    required: false,
  })
  @IsOptional()
  level?: string;
}

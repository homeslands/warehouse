import { HttpStatus } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AppResponseDto<T> {
  @ApiProperty()
  message: string;

  @ApiProperty({ example: HttpStatus.OK })
  statusCode: HttpStatus;

  @ApiProperty({ example: '2026-10-17T08:00:00.000Z' })
  timestamp: string;

  @ApiPropertyOptional({ example: 'GET' })
  method?: string;

  @ApiPropertyOptional()
  path?: string;

  result?: T;
}

export class AppPaginatedResponseDto<T> {
  items: T[];

  @ApiProperty({ description: 'Total number of records matching the filters', example: 42 })
  total: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page: number;

  @ApiProperty({ description: 'Page size', example: 10 })
  pageSize: number;

  @ApiProperty({ example: 5 })
  totalPages: number;

  @ApiProperty()
  hasNext: boolean;

  // Sai chính tả nhưng là tên field client đang dùng — đổi là breaking change.
  @ApiProperty()
  hasPrevios: boolean;
}

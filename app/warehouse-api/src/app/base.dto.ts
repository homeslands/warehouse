import { ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * Query phân trang + sắp xếp + lọc theo ngày tạo (`createdAt`) dùng chung cho mọi endpoint danh sách.
 */
export class BaseQueryDto {
  @ApiPropertyOptional({ type: Number, description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, description: 'Page size', example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  size = 10;

  @ApiPropertyOptional({
    description: 'Sort direction by creation date (case-insensitive)',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(SortOrder, { message: 'SORT_INVALID' })
  sort?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({
    description:
      'Creation date from (inclusive). `YYYY-MM-DD` counts from 00:00 server time, or a full ' +
      'ISO 8601 timestamp.',
    example: '2026-09-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'START_DATE_INVALID' })
  startDate?: string;

  @ApiPropertyOptional({
    description:
      'Creation date to (inclusive). `YYYY-MM-DD` covers the whole day, or a full ISO 8601 ' +
      'timestamp.',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsDateString({}, { message: 'END_DATE_INVALID' })
  endDate?: string;
}

export class BaseResponseDto {
  @AutoMap()
  @ApiPropertyOptional()
  slug: string;

  @AutoMap()
  @ApiPropertyOptional()
  createdAt: string;

  @AutoMap()
  @ApiPropertyOptional()
  updatedAt: string;
}

// Dùng cho entity extends VersionedBase — client phải giữ lại `version` và gửi lại khi update.
export class VersionedResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiPropertyOptional()
  version: number;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class BaseQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ description: 'Page size', example: 10, default: 10 })
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
}

/**
 * Query phân trang kèm lọc theo ngày tạo (`createdAt`). Cả 2 mốc đều optional, service tự quy đổi
 * bằng `resolveDateRange()` (`src/shared/utils/query.util.ts`) và tự kiểm `startDate <= endDate`.
 */
export class PaginationQueryDto extends BaseQueryDto {
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

import { ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, Min } from 'class-validator';

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
    description: 'Sort fields, e.g. createdAt:DESC',
    example: ['createdAt:DESC'],
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  sort?: string[];
}

export class BaseResponseDto {
  @AutoMap()
  @ApiPropertyOptional()
  id: string;

  @AutoMap()
  @ApiPropertyOptional()
  slug: string;

  @AutoMap()
  @ApiPropertyOptional()
  createdAt: Date;

  @AutoMap()
  @ApiPropertyOptional()
  updatedAt: Date;
}

import { IsNotEmpty, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { TAX_PROFILE_TAX_CODE_REGEX } from './tax-profile.constants';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Dùng chung cho cả 2 route có `:taxCode`. Regex NHẬN mã chi nhánh (`-001`) rồi service mới chặn
 * bằng mã lỗi riêng — để thông báo nói đúng nguyên nhân thay vì "sai định dạng".
 */
export class LookupTaxProfileParamDto {
  @ApiProperty({ description: 'The tax code (MST) to look up', example: '0101245486' })
  @Transform(trim)
  @Matches(TAX_PROFILE_TAX_CODE_REGEX, { message: 'TAX_PROFILE_TAX_CODE_INVALID' })
  @IsNotEmpty({ message: 'TAX_PROFILE_TAX_CODE_IS_REQUIRED' })
  taxCode: string;
}

export class GetAllTaxProfileRequestDto extends BaseQueryDto {}

export class TaxProfileResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  taxCode: string;

  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiPropertyOptional()
  internationalName?: string;

  @AutoMap()
  @ApiPropertyOptional()
  shortName?: string;

  @AutoMap()
  @ApiPropertyOptional()
  address?: string;

  @AutoMap()
  @ApiPropertyOptional({ description: 'Taxpayer status, e.g. "NNT đang hoạt động"' })
  status?: string;

  @AutoMap()
  @ApiPropertyOptional({
    description:
      'Khi nào dữ liệu được cập nhật BÊN cơ quan thuế (không phải mốc sync của hệ thống)',
  })
  sourceUpdatedAt?: Date;
}

/**
 * Body upstream (`api.vietqr.io/v2/business/{taxCode}`) — interface mô tả dữ liệu bên ngoài, KHÔNG
 * phải DTO có validator: nó không bao giờ đi qua `ValidationPipe`, service tự kiểm `code`.
 */
export interface VietQrBusinessData {
  id?: string;
  name?: string;
  internationalName?: string | null;
  shortName?: string | null;
  address?: string | null;
  status?: string | null;
}

export interface VietQrBusinessResponse {
  code?: string;
  desc?: string;
  data?: VietQrBusinessData | null;
  metadata?: { source?: string; updatedAt?: string } | null;
}

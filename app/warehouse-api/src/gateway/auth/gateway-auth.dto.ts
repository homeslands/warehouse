import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidationOptions,
} from 'class-validator';
import { LIST_SORT_BY_VALUES, LIST_SORT_VALUES } from 'src/grpc/enum/w02-storage-enums';
import {
  LIST_QUERY_MAX_LENGTH,
  LOGIN_PASSWORD_MAX_LENGTH,
  SESSION_LIST_MAX_PAGE_SIZE,
} from 'src/session/session.constants';
import { newPasswordErrors } from 'src/session/session.policy';
import { SessionFieldErrorKey } from 'src/session/session.validation';
import { GatewayFieldErrorKey } from '../gateway.validation';

/**
 * DTO biên Gateway v1 theo OpenAPI R2 (W02 I-02b). Gateway chỉ kiểm định dạng; Storage vẫn kiểm lại toàn bộ
 * (business-rules: "bắt buộc tại Storage Service, kể cả gọi trực tiếp RPC"). Message = key lỗi (BE-DTO-03).
 */

/** OpenAPI `Login`. Identifier ASCII được Storage kiểm (sai ⇒ 401 chung, không lộ định dạng tài khoản). */
export class V1LoginDto {
  @ApiProperty({ minLength: 1, example: '0900000001' })
  @IsString({ message: SessionFieldErrorKey.PHONE_NUMBER_REQUIRED })
  @IsNotEmpty({ message: SessionFieldErrorKey.PHONE_NUMBER_REQUIRED })
  phoneNumber: string;

  @ApiProperty({ minLength: 1, maxLength: LOGIN_PASSWORD_MAX_LENGTH, writeOnly: true })
  // class-validator chạy decorator từ dưới lên; `stopAtFirstError` ⇒ kiểm kiểu/rỗng trước, độ dài sau.
  @MaxLength(LOGIN_PASSWORD_MAX_LENGTH, { message: SessionFieldErrorKey.PASSWORD_TOO_LONG })
  @IsNotEmpty({ message: SessionFieldErrorKey.PASSWORD_REQUIRED })
  @IsString({ message: SessionFieldErrorKey.PASSWORD_REQUIRED })
  password: string;
}

/** business-rules §16: ≥12 ký tự (code point), ≤72 byte UTF-8 — cùng hàm với Storage. */
function IsNewPassword(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isNewPassword',
      validator: {
        validate: (value: unknown) => newPasswordErrors('newPassword', value).length === 0,
        defaultMessage: (args) =>
          newPasswordErrors('newPassword', args?.value)[0]?.errorKey ??
          GatewayFieldErrorKey.VALUE_INVALID,
      },
    },
    options,
  );
}

/** OpenAPI `PasswordChange`. */
export class V1PasswordChangeDto {
  @ApiProperty({ writeOnly: true })
  @IsString({ message: SessionFieldErrorKey.CURRENT_PASSWORD_REQUIRED })
  @IsNotEmpty({ message: SessionFieldErrorKey.CURRENT_PASSWORD_REQUIRED })
  currentPassword: string;

  @ApiProperty({ minLength: 12, maxLength: 72, writeOnly: true })
  @IsNewPassword()
  newPassword: string;
}

/** Query `listOwnSessions`: page ≥1, pageSize 1..100, q ≤200, sortBy/sort theo enum OpenAPI. */
export class V1ListOwnSessionsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: SessionFieldErrorKey.PAGE_INVALID })
  @Min(1, { message: SessionFieldErrorKey.PAGE_INVALID })
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: SESSION_LIST_MAX_PAGE_SIZE, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: SessionFieldErrorKey.PAGE_SIZE_INVALID })
  @Min(1, { message: SessionFieldErrorKey.PAGE_SIZE_INVALID })
  @Max(SESSION_LIST_MAX_PAGE_SIZE, { message: SessionFieldErrorKey.PAGE_SIZE_INVALID })
  pageSize?: number;

  @ApiPropertyOptional({ maxLength: LIST_QUERY_MAX_LENGTH })
  @IsOptional()
  @IsString({ message: GatewayFieldErrorKey.VALUE_INVALID })
  @MaxLength(LIST_QUERY_MAX_LENGTH, { message: GatewayFieldErrorKey.VALUE_INVALID })
  q?: string;

  @ApiPropertyOptional({ enum: LIST_SORT_BY_VALUES })
  @IsOptional()
  @IsIn(LIST_SORT_BY_VALUES, { message: SessionFieldErrorKey.SORT_BY_UNSUPPORTED })
  sortBy?: (typeof LIST_SORT_BY_VALUES)[number];

  @ApiPropertyOptional({ enum: LIST_SORT_VALUES })
  @IsOptional()
  @IsIn(LIST_SORT_VALUES, { message: SessionFieldErrorKey.SORT_INVALID })
  sort?: (typeof LIST_SORT_VALUES)[number];
}

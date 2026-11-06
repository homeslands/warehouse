import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, MaxLength, Min, ValidateIf } from 'class-validator';
import { RbacFieldErrorKey } from 'src/rbac-v1/rbac-v1.validation';

/**
 * DTO biên Gateway cho RBAC v1 (W02 I-03a). `forbidNonWhitelisted` (V1_VALIDATION_OPTIONS) ⇒ field lạ như
 * `authorityCodes`/`family`/`builtIn` trong PATCH role bị 422 (TC-RBAC-08: không bulk grant qua ROLE_UPDATE).
 * Field PATCH dùng `ValidateIf(!== undefined)` thay vì `IsOptional`: `IsOptional` bỏ qua cả `null`, còn ở
 * đây `null` phải bị từ chối (các field này không nullable theo OpenAPI).
 */
export class V1RolePatchDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: RbacFieldErrorKey.VERSION_INVALID })
  @Min(1, { message: RbacFieldErrorKey.VERSION_INVALID })
  version: number;

  @ApiPropertyOptional({ minLength: 2, maxLength: 100 })
  @ValidateIf((dto: V1RolePatchDto) => dto.name !== undefined)
  @Length(2, 100, { message: RbacFieldErrorKey.NAME_INVALID })
  @IsString({ message: RbacFieldErrorKey.NAME_INVALID })
  name?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @ValidateIf((dto: V1RolePatchDto) => dto.description !== undefined)
  @MaxLength(1000, { message: RbacFieldErrorKey.DESCRIPTION_INVALID })
  @IsString({ message: RbacFieldErrorKey.DESCRIPTION_INVALID })
  description?: string;
}

/** Body `updateAuthorityMetadata`: `{version*, name, groupId}`, additionalProperties false. */
export class V1AuthorityPatchDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: RbacFieldErrorKey.VERSION_INVALID })
  @Min(1, { message: RbacFieldErrorKey.VERSION_INVALID })
  version: number;

  @ApiPropertyOptional({ maxLength: 255 })
  @ValidateIf((dto: V1AuthorityPatchDto) => dto.name !== undefined)
  @Length(1, 255, { message: RbacFieldErrorKey.NAME_INVALID })
  @IsString({ message: RbacFieldErrorKey.NAME_INVALID })
  name?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((dto: V1AuthorityPatchDto) => dto.groupId !== undefined)
  @IsUUID('all', { message: RbacFieldErrorKey.GROUP_INVALID })
  groupId?: string;
}

/** Query `version` bắt buộc của deleteRole / deleteRoleAuthority. */
export class V1VersionQueryDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: RbacFieldErrorKey.VERSION_INVALID })
  @Min(1, { message: RbacFieldErrorKey.VERSION_INVALID })
  version: number;
}

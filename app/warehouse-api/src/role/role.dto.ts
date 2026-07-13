import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BaseResponseDto } from 'src/app/base.dto';
import { RoleEnum } from './role.enum';

export class CreateRoleRequestDto {
  @AutoMap()
  @ApiProperty({ enum: RoleEnum })
  @IsNotEmpty({ message: 'ROLE_NAME_IS_REQUIRED' })
  @IsEnum(RoleEnum, { message: 'ROLE_NAME_IS_REQUIRED' })
  name: RoleEnum;

  @AutoMap()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRoleRequestDto {
  @AutoMap()
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class RoleResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty({ enum: RoleEnum })
  name: RoleEnum;

  @AutoMap()
  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ type: [String], description: 'Authority codes currently granted to this role' })
  authorityCodes: string[];
}

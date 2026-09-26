import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { BaseResponseDto } from 'src/app/base.dto';
import { RoleEnum } from './role.enum';

export class CreateRoleRequestDto {
  // Tên tự do (không còn giới hạn trong `RoleEnum`) để thêm được role mới; vị trí trong thứ bậc do
  // `level` quyết định chứ không phải tên.
  @AutoMap()
  @ApiProperty({ example: 'TEAM_LEAD' })
  @IsNotEmpty({ message: 'ROLE_NAME_IS_REQUIRED' })
  @IsString({ message: 'ROLE_NAME_IS_REQUIRED' })
  name: string;

  @AutoMap()
  @ApiProperty({
    description: 'Cấp của role, số lớn = cấp cao; phải thấp hơn cấp của người tạo',
    example: 15,
  })
  @IsInt()
  @Min(1)
  level: number;

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
  @ApiProperty({ example: RoleEnum.Manager })
  name: string;

  @AutoMap()
  @ApiProperty({ description: 'Cấp của role, số lớn = cấp cao' })
  level: number;

  @AutoMap()
  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ type: [String], description: 'Authority codes currently granted to this role' })
  authorityCodes: string[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { IsOptional, IsString } from 'class-validator';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';
import { AuthorityGroupResponseDto } from 'src/authority-group/authority-group.dto';

export class AuthorityResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiProperty({ description: 'Machine key used in @RequireAuthority(code)' })
  code: string;

  @AutoMap(() => AuthorityGroupResponseDto)
  @ApiProperty({ type: AuthorityGroupResponseDto })
  authorityGroup: AuthorityGroupResponseDto;
}

export class GetAllAuthorityRequestDto extends BaseQueryDto {
  @ApiPropertyOptional({ description: 'Filter by authority group slug' })
  @IsOptional()
  @IsString()
  authorityGroupSlug?: string;
}

export class UpdateAuthorityRequestDto {
  @ApiPropertyOptional({ description: 'Display name (code is immutable, not editable here)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Slug of the authority group to move this authority into' })
  @IsOptional()
  @IsString()
  authorityGroupSlug?: string;
}

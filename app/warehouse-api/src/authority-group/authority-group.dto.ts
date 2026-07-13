import { ApiProperty } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseResponseDto } from 'src/app/base.dto';

export class AuthorityGroupResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  name: string;
}

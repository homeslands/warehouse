import { IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';

export class CreateExampleRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The name of example', example: 'Example A' })
  @IsNotEmpty({ message: 'EXAMPLE_NAME_IS_REQUIRED' })
  name: string;

  @AutoMap()
  @ApiProperty({ description: 'The description of example', required: false })
  @IsOptional()
  description?: string;
}

export class UpdateExampleRequestDto extends CreateExampleRequestDto {}

export class GetAllExampleRequestDto extends BaseQueryDto {}

export class ExampleResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiProperty()
  description?: string;
}

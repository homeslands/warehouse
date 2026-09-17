import { IsInt, IsNotEmpty, IsOptional, Min } from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, VersionedResponseDto } from 'src/app/base.dto';

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

/**
 * PATCH đúng nghĩa REST: mọi field nghiệp vụ đều optional, field nào không gửi thì giữ nguyên giá
 * trị cũ (`PartialType` gắn `@IsOptional()` lên toàn bộ field thừa hưởng, validator vẫn chạy khi
 * field CÓ mặt). Chỉ `version` là bắt buộc — nó không phải dữ liệu nghiệp vụ mà là điều kiện của
 * optimistic lock.
 */
export class UpdateExampleRequestDto extends PartialType(CreateExampleRequestDto) {
  @ApiProperty({
    description: 'Version nhận được từ lần GET gần nhất, dùng để phát hiện xung đột',
    minimum: 1,
  })
  @IsNotEmpty()
  @IsInt()
  // `@Min(1)`: TypeORM bọc cả khối so sánh version của optimistic lock trong
  // `if (result && lockMode === 'optimistic' && lockVersion)` (`SelectQueryBuilder.js:691-693`) —
  // `0` là falsy nên `version: 0` khiến check KHÔNG chạy và `save()` ghi đè vô điều kiện, chỉ với 1
  // request. `@IsNotEmpty`/`@IsInt` đều cho `0` qua; `@VersionColumn` luôn bắt đầu từ 1.
  @Min(1)
  version: number;
}

export class GetAllExampleRequestDto extends BaseQueryDto {}

export class ExampleResponseDto extends VersionedResponseDto {
  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiProperty()
  description?: string;
}

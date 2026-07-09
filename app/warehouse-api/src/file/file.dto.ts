import { ApiProperty } from '@nestjs/swagger';

export class FileResponseDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  extension: string;

  @ApiProperty()
  mimetype: string;

  @ApiProperty()
  data: Buffer;

  @ApiProperty()
  size: number;
}

import { Controller, HttpStatus, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { Public } from 'src/auth/decorator/public.decorator';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileService } from './file.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppResponseDto } from 'src/app/app.dto';

@ApiBearerAuth()
@Controller('file')
@ApiTags('File')
export class FileController {
  constructor(private fileService: FileService) {}

  @Public()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload file' })
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    const result = await this.fileService.uploadFile(file);
    return {
      message: `File ${result} uploaded to S3 successfully`,
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<void>;
  }
}

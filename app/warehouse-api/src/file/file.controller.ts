import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileService } from './file.service';
import { AppResponseDto } from 'src/app/app.dto';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { CustomFileInterceptor } from './custom-interceptor';
import {
  FILE_UPLOAD_FIELD_NAME,
  FILE_UPLOAD_MAX_COUNT,
  FILE_UPLOAD_MULTER_SIZE_LIMIT,
} from './file.constant';
import { uploadFileFilter } from './file.util';

@ApiBearerAuth()
@Controller('file')
@ApiTags('File')
export class FileController {
  constructor(private fileService: FileService) {}

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [FILE_UPLOAD_FIELD_NAME],
      properties: {
        [FILE_UPLOAD_FIELD_NAME]: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @RequireAuthority(AuthorityCode.FileCreate)
  // `CustomFileInterceptor` thay `FileInterceptor` của Nest: bản của Nest đổi lỗi multer thành
  // 413/400 không có `code`; bản này map mọi lỗi multer/`fileFilter` sang `FileException` (422).
  @UseInterceptors(
    new CustomFileInterceptor(FILE_UPLOAD_FIELD_NAME, {
      limits: { fileSize: FILE_UPLOAD_MULTER_SIZE_LIMIT, files: FILE_UPLOAD_MAX_COUNT },
      fileFilter: uploadFileFilter,
    }),
  )
  @ApiOperation({
    summary: 'Upload file',
    description:
      'Max 10MB inclusive (10485760 bytes), 1 file, pdf/jpg/jpeg/png/webp/xls/xlsx/doc/docx ' +
      '(extension and mimetype must both match). The S3 key is returned in `message`. ' +
      'Requires FILE_CREATE',
  })
  // Không `@ApiResponseWithType`: response không có `result` — key S3 nằm trong `message`, hợp đồng
  // UI (`warehouse-ui/src/shared/api/file.api.ts`) đọc từ đó, không đổi được trong task này.
  async uploadFile(@UploadedFile() file: Express.Multer.File | undefined) {
    const result = await this.fileService.uploadFile(file);
    return {
      message: `File ${result} uploaded to S3 successfully`,
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<void>;
  }
}

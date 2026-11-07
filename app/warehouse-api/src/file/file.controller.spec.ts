import { HttpStatus, INestApplication } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import request from 'supertest';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { IS_PUBLIC_KEY } from 'src/auth/decorator/public.decorator';
import { HttpExceptionFilter } from 'src/app/http-exception.filter';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { FileValidation } from './file.validation';
import { FILE_UPLOAD_MAX_SIZE } from './file.constant';
import { S3Service } from './s3/s3.service';

const S3_KEY = 'contract-1700000000000.pdf';

describe('FileController', () => {
  let app: INestApplication;
  let controller: FileController;
  const s3Service = { uploadFile: jest.fn() };

  beforeAll(async () => {
    // FileService thật (gồm rào thiếu file), chỉ giả S3. Không có guard global ⇒ đây là test
    // multer/filter/exception, quyền được khoá bằng metadata ở dưới.
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FileController],
      providers: [
        FileService,
        { provide: S3Service, useValue: s3Service },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    controller = module.get(FileController);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    s3Service.uploadFile.mockResolvedValue(S3_KEY);
  });

  // `AuthorityGuard` chỉ đọc metadata này — gỡ/sửa nhầm decorator là mở upload S3 cho người khác.
  describe('authorization metadata', () => {
    it('requires FILE_CREATE on POST /file/upload', () => {
      expect(Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, controller.uploadFile)).toEqual([
        AuthorityCode.FileCreate,
      ]);
      expect(AuthorityCode.FileCreate).toBe('FILE_CREATE');
    });

    it('declares 201 explicitly', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.uploadFile)).toBe(
        HttpStatus.CREATED,
      );
    });

    it('is no longer public', () => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, controller.uploadFile)).toBeUndefined();
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, FileController)).toBeUndefined();
    });
  });

  describe('POST /file/upload (multipart, in-process)', () => {
    const upload = () => request(app.getHttpServer()).post('/file/upload');

    const expectFileError = (body: Record<string, unknown>, code: number) => {
      expect(body.statusCode).toBe(422);
      expect(body.code).toBe(code);
    };

    it('uploads an allowed file and keeps the S3 key in `message` (UI contract)', async () => {
      const res = await upload().attach('file', Buffer.from('%PDF-1.4'), {
        filename: 'contract.pdf',
        contentType: 'application/pdf',
      });

      expect(res.status).toBe(201);
      expect(res.body.statusCode).toBe(201);
      expect(res.body.message).toBe(`File ${S3_KEY} uploaded to S3 successfully`);
      expect(res.body.result).toBeUndefined();
      expect(s3Service.uploadFile).toHaveBeenCalledTimes(1);
    });

    it('rejects a disallowed type with FILE_TYPE_NOT_ALLOWED (422) before touching S3', async () => {
      const res = await upload().attach('file', Buffer.from('<script></script>'), {
        filename: 'page.html',
        contentType: 'text/html',
      });

      expect(res.status).toBe(422);
      expectFileError(res.body, FileValidation.FILE_TYPE_NOT_ALLOWED.code);
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });

    it.each([
      ['photo.webp', 'image/webp'],
      ['legacy.xls', 'application/vnd.ms-excel'],
      ['legacy.doc', 'application/msword'],
    ])('uploads %s (%s), added to the allowlist on 2026-11-05', async (filename, contentType) => {
      const res = await upload().attach('file', Buffer.from('x'), { filename, contentType });

      expect(res.status).toBe(201);
    });

    it('rejects an allowed extension with a spoofed mimetype', async () => {
      const res = await upload().attach('file', Buffer.from('<html></html>'), {
        filename: 'evil.pdf',
        contentType: 'text/html',
      });

      expect(res.status).toBe(422);
      expectFileError(res.body, FileValidation.FILE_TYPE_NOT_ALLOWED.code);
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });

    // Biên người dùng chốt 2026-11-05: ≤ 10MB qua (đúng 10 485 760 byte vẫn qua).
    it('accepts a file of exactly the size limit (10 485 760 bytes)', async () => {
      const res = await upload().attach('file', Buffer.alloc(FILE_UPLOAD_MAX_SIZE), {
        filename: 'big.pdf',
        contentType: 'application/pdf',
      });

      expect(res.status).toBe(201);
      expect(s3Service.uploadFile).toHaveBeenCalledTimes(1);
    });

    it('rejects a file 1 byte over the limit with FILE_SIZE_EXCEEDS_LIMIT_ALLOWED (422, not 413)', async () => {
      const res = await upload().attach('file', Buffer.alloc(FILE_UPLOAD_MAX_SIZE + 1), {
        filename: 'too-big.pdf',
        contentType: 'application/pdf',
      });

      expect(res.status).toBe(422);
      expectFileError(res.body, FileValidation.FILE_SIZE_EXCEEDS_LIMIT_ALLOWED.code);
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects a second file with a 422 FileException', async () => {
      const res = await upload()
        .attach('file', Buffer.from('a'), { filename: 'a.pdf', contentType: 'application/pdf' })
        .attach('file', Buffer.from('b'), { filename: 'b.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(422);
      expectFileError(res.body, FileValidation.NUMBER_OF_FILES_EXCEED_LIMIT_ALLOWED.code);
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects a file sent under another field name with LIMIT_UNEXPECTED_FILE (422)', async () => {
      const res = await upload().attach('document', Buffer.from('a'), {
        filename: 'a.pdf',
        contentType: 'application/pdf',
      });

      expect(res.status).toBe(422);
      expectFileError(res.body, FileValidation.LIMIT_UNEXPECTED_FILE.code);
    });

    it('rejects a multipart request without a file with FILE_NOT_FOUND (422)', async () => {
      const res = await upload().field('note', 'no file here');

      expect(res.status).toBe(422);
      expectFileError(res.body, FileValidation.FILE_NOT_FOUND.code);
      expect(s3Service.uploadFile).not.toHaveBeenCalled();
    });

    it('rejects a non-multipart request with FILE_NOT_FOUND (422)', async () => {
      const res = await upload().send({});

      expect(res.status).toBe(422);
      expectFileError(res.body, FileValidation.FILE_NOT_FOUND.code);
    });
  });
});

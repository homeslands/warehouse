import { FileService } from './file.service';
import { FileException } from './file.exception';
import { FileValidation } from './file.validation';
import { S3Service } from './s3/s3.service';

describe('FileService.uploadFile', () => {
  const s3Service = { uploadFile: jest.fn() };
  const logger = { log: jest.fn() };
  const service = new FileService(logger as never, s3Service as unknown as S3Service);

  beforeEach(() => jest.clearAllMocks());

  it('throws FILE_NOT_FOUND (422) and never calls S3 when the request has no file', async () => {
    const error = await service.uploadFile(undefined).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FileException);
    expect((error as FileException).code).toBe(FileValidation.FILE_NOT_FOUND.code);
    expect((error as FileException).getStatus()).toBe(422);
    expect(s3Service.uploadFile).not.toHaveBeenCalled();
  });

  it('returns the S3 key of the uploaded file', async () => {
    s3Service.uploadFile.mockResolvedValue('contract-1700000000000.pdf');
    const file = { originalname: 'contract.pdf' } as Express.Multer.File;

    await expect(service.uploadFile(file)).resolves.toBe('contract-1700000000000.pdf');
    expect(s3Service.uploadFile).toHaveBeenCalledWith(file);
  });
});

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { S3Service } from './s3.service';

const BUCKET = 'test-bucket';
const KEY_PATTERN = /^[a-z0-9_-]+-[0-9a-f-]{36}\.pdf$/;

const multerFile = (originalname: string, mimetype = 'application/pdf') =>
  ({ originalname, mimetype, buffer: Buffer.from(originalname) }) as Express.Multer.File;

describe('S3Service upload keys', () => {
  const configService = {
    get: jest.fn((name: string) => (name === 'AWS_BUCKET' ? BUCKET : 'test-value')),
  };
  const logger = { log: jest.fn() };
  let send: jest.SpyInstance;
  let service: S3Service;

  const sentCommands = (): PutObjectCommand[] =>
    send.mock.calls.map(([command]) => command as PutObjectCommand);

  beforeEach(() => {
    // Không gọi S3 thật: chặn `send` của mọi S3Client.
    send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
    service = new S3Service(configService as unknown as ConfigService, logger as never);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('uploadFile', () => {
    it('puts the object under the folder with the last extension and keeps the mimetype', async () => {
      const file = multerFile('Hoá đơn.exe.PDF');

      const key = await service.uploadFile(file, 'import-forms');

      expect(key).toMatch(/^import-forms\/hoa-don-exe-[0-9a-f-]{36}\.pdf$/);
      expect(send).toHaveBeenCalledTimes(1);
      const [command] = sentCommands();
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toEqual({
        Bucket: BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: 'application/pdf',
      });
    });

    it('builds a key without folder and without extension when the name has none', async () => {
      const key = await service.uploadFile(multerFile('../../README', 'text/plain'));

      expect(key).toMatch(/^readme-[0-9a-f-]{36}$/);
      expect(sentCommands()[0].input).toMatchObject({ Key: key, ContentType: 'text/plain' });
    });

    // #184: tên do client gửi có CR/LF không được lọt vào log (chèn dòng log giả) — log key đã sạch.
    it('logs the sanitized key, never the raw client file name', async () => {
      logger.log.mockClear();
      const raw = 'bao-cao.pdf\r\n2026-11-05 ERROR forged line';

      const key = await service.uploadFile(multerFile(raw), 'import-forms');

      expect(logger.log).toHaveBeenCalledTimes(1);
      const [message] = logger.log.mock.calls[0];
      expect(message).toContain(key);
      expect(message).not.toContain(raw);
      expect(message).not.toMatch(/[\r\n]/);
    });
  });

  describe('uploadFiles', () => {
    it('gives two files with the same name different keys in the same call', async () => {
      const files = [multerFile('report.pdf'), multerFile('report.pdf')];

      const keys = await service.uploadFiles(files);

      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toBe(keys[1]);
      keys.forEach((key) => expect(key).toMatch(KEY_PATTERN));
      expect(sentCommands().map((command) => command.input.Key)).toEqual(keys);
    });

    it('sanitizes each name and keeps each mimetype', async () => {
      const files = [multerFile('a\\b.pdf'), multerFile('ảnh chụp.PNG', 'image/png')];

      const keys = await service.uploadFiles(files);

      expect(keys[0]).toMatch(/^b-[0-9a-f-]{36}\.pdf$/);
      expect(keys[1]).toMatch(/^anh-chup-[0-9a-f-]{36}\.png$/);
      expect(sentCommands().map((command) => command.input.ContentType)).toEqual([
        'application/pdf',
        'image/png',
      ]);
    });
  });
});

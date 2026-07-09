import { Inject, Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

@Injectable()
export class S3Service {
  private s3: S3Client;
  private readonly AWS_REGION: string;
  private readonly AWS_ACCESS_KEY_ID: string;
  private readonly AWS_SECRET_ACCESS_KEY: string;
  private readonly AWS_BUCKET: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {
    this.AWS_REGION = this.configService.get<string>('AWS_REGION');
    this.AWS_ACCESS_KEY_ID = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    this.AWS_SECRET_ACCESS_KEY = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    this.AWS_BUCKET = this.configService.get<string>('AWS_BUCKET');

    this.s3 = new S3Client({
      region: this.AWS_REGION,
      credentials: {
        accessKeyId: this.AWS_ACCESS_KEY_ID,
        secretAccessKey: this.AWS_SECRET_ACCESS_KEY,
      },
    });
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    const context = `${S3Service.name}.${this.uploadFile.name}`;
    const filename = file.originalname.split('.')[0].replace(' ', '-');
    const key = `${filename}-${Date.now()}.${file.originalname.split('.')[1]}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.AWS_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    this.logger.log(`File ${file.originalname} uploaded to S3`, context);

    return key;
  }

  async uploadFiles(files: Express.Multer.File[]): Promise<string[]> {
    const uploads = files.map(async (file) => {
      const filename = file.originalname.split('.')[0].replace(' ', '-');
      const key = `${filename}-${Date.now()}.${file.originalname.split('.')[1]}`;

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.AWS_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      return key;
    });

    return Promise.all(uploads);
  }

  async deleteFile(key: string): Promise<void> {
    const context = `${S3Service.name}.${this.deleteFile.name}`;
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.AWS_BUCKET,
        Key: key,
      }),
    );
    this.logger.log(`File ${key} deleted from S3`, context);
  }
}

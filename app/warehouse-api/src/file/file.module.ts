import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { S3Service } from './s3/s3.service';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [FileController],
  providers: [FileService, S3Service],
  exports: [FileService, S3Service],
})
export class FileModule {}

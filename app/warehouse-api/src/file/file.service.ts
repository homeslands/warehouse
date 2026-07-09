import { Inject, Injectable, Logger } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import path from 'path';
import { Workbook } from 'exceljs';
import ExcelJS from 'exceljs';
import { generateFileName } from './file.util';
import { Extension } from './file.constant';
import { FileException } from './file.exception';
import { FileValidation } from './file.validation';
import { FileResponseDto } from './file.dto';
import { S3Service } from './s3/s3.service';

@Injectable()
export class FileService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly s3Service: S3Service,
  ) {}

  async uploadFile(file: Express.Multer.File) {
    const context = `${FileService.name}.${this.uploadFile.name}`;
    const key = await this.s3Service.uploadFile(file);
    this.logger.log(`File ${file.originalname} uploaded to S3 with key ${key}`, context);
    return key;
  }

  async uploadFiles(files: Express.Multer.File[]) {
    const context = `${FileService.name}.${this.uploadFiles.name}`;
    const uploadedFiles = await this.s3Service.uploadFiles(files);
    this.logger.log(`Files uploaded successfully`, context);
    return uploadedFiles;
  }

  public async removeFile(filename?: string): Promise<void> {
    const context = `${FileService.name}.${this.removeFile.name}`;
    if (filename) {
      await this.s3Service.deleteFile(filename);
    }
    this.logger.log(`File ${filename} removed successfully`, context);
  }

  public handleDuplicateFilesName(files: Express.Multer.File[]): Express.Multer.File[] {
    const fileNameCount: { [key: string]: number } = {};
    const renamedFiles: Express.Multer.File[] = [];

    files.forEach((file) => {
      const fileExtension = file.originalname.split('.').pop();
      const baseName = file.originalname.replace(/\.[^/.]+$/, '');

      if (fileNameCount[baseName]) {
        fileNameCount[baseName]++;
      } else {
        fileNameCount[baseName] = 1;
      }

      const newName =
        fileNameCount[baseName] === 1
          ? file.originalname
          : `${baseName}(${fileNameCount[baseName] - 1}).${fileExtension}`;

      renamedFiles.push({
        ...file,
        originalname: newName,
      });
    });

    return renamedFiles;
  }

  public async generateExcelFile({
    filename,
    cellData,
  }: {
    filename: string;
    cellData: {
      cellPosition: string;
      value: string | number;
      type: string;
      style?: Partial<ExcelJS.Style>;
    }[];
  }): Promise<FileResponseDto> {
    const templatePath = path.resolve('public/templates/excel', filename);
    const workbook = new Workbook();
    await workbook.xlsx.readFile(templatePath);

    if (workbook.worksheets.length <= 0) throw new FileException(FileValidation.FILE_NOT_FOUND);
    const worksheet = workbook.worksheets[0];

    for (const item of cellData) {
      if (item.type === 'data') {
        worksheet.getCell(item.cellPosition).value = item.value;
      } else if (item.type === 'image') {
        const imageUrl = item.value as string;
        const response = await fetch(imageUrl);
        const buffer = await response.arrayBuffer();

        const image = workbook.addImage({
          buffer: buffer,
          extension: 'jpeg',
        });

        const tl = this.extractPosition(item.cellPosition);
        if (tl) {
          worksheet.addImage(image, {
            tl: { col: 0, row: 0 },
            ext: { width: 120, height: 80 },
            editAs: 'oneCell',
          });
        }
      }

      if (item.style) {
        worksheet.getCell(item.cellPosition).style = item.style;
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const nodeBuffer: Buffer = Buffer.from(buffer);

    return {
      name: generateFileName(Extension.EXCEL),
      extension: Extension.EXCEL,
      mimetype: Extension.EXCEL,
      data: nodeBuffer,
      size: nodeBuffer.length,
    };
  }

  private extractPosition(cellPosition: string) {
    const match = cellPosition.match(/^([A-Z]+)(\d+)$/);

    if (match) {
      return {
        col: this.columnToNumber(match[1]),
        row: parseInt(match[2], 10),
      };
    }

    return null;
  }

  private columnToNumber(column: string) {
    let number = 0;
    for (let i = 0; i < column.length; i++) {
      number = number * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return number;
  }

  async getTemplateExcel(filename: string): Promise<FileResponseDto> {
    const templatePath = path.resolve('public/templates/excel', filename);
    const workbook = new Workbook();
    await workbook.xlsx.readFile(templatePath);

    if (workbook.worksheets.length <= 0) {
      throw new FileException(FileValidation.FILE_NOT_FOUND);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const nodeBuffer: Buffer = Buffer.from(buffer);

    return {
      name: generateFileName(Extension.EXCEL),
      extension: Extension.EXCEL,
      mimetype: Extension.EXCEL,
      data: nodeBuffer,
      size: nodeBuffer.length,
    };
  }
}

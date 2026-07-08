import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import * as fs from 'fs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import * as path from 'path';
import { DbException } from './db.exception';
import { DbValidation } from './db.validation';

@Injectable()
export class DbService {
  private readonly databaseMySql = this.configService.get<string>('DATABASE_NAME');
  private readonly hostMySql = this.configService.get<string>('DATABASE_HOST');
  private readonly userMySql = this.configService.get<string>('DATABASE_USERNAME');
  private readonly passwordMySql = this.configService.get<string>('DATABASE_PASSWORD');

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {}

  async backup(): Promise<string> {
    return this.export();
  }

  private async export(): Promise<string> {
    const context = `${DbService.name}.${this.export.name}`;
    return new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '_');
      const fileName = `${this.databaseMySql}_${timestamp}.sql`;
      const backupPath = path.resolve('public/backup');
      if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true });
      }
      const dumpFilePath = path.join(backupPath, fileName);

      const dumpCommand = `mysqldump -h ${this.hostMySql} -u ${this.userMySql} -p${this.passwordMySql} ${this.databaseMySql} > ${dumpFilePath}`;

      exec(dumpCommand, (error, stdout, stderr) => {
        if (error) {
          this.logger.error(`Error: ${error.message}`, error.stack, context);
          return reject(new DbException(DbValidation.EXPORT_DATABASE_ERROR));
        }
        if (stderr) {
          this.logger.error(`stderr: ${stderr}`, null, context);
        }
        resolve(dumpFilePath);
      });
    });
  }
}

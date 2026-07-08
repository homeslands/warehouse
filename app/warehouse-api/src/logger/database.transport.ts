import { DataSource } from 'typeorm';
import Transport from 'winston-transport';
import { LoggerEntry } from './logger.entity';

export class DatabaseTransport extends Transport {
  constructor(
    private readonly dataSource: DataSource,
    opts?: Transport.TransportStreamOptions,
  ) {
    super(opts);
  }

  log(info: Record<string, unknown>, callback: () => void) {
    setImmediate(() => this.emit('logged', info));

    const loggerRepository = this.dataSource.getRepository(LoggerEntry);
    const entry = loggerRepository.create({
      level: info.level as string,
      message: info.message as string,
      context: (info.context as string) ?? null,
      pid: process.pid,
      timestamp: info.timestamp as string,
    });
    loggerRepository.save(entry).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error saving log to database:', error);
    });

    callback();
  }
}

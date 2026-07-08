import { Module } from '@nestjs/common';
import { DbService } from './db.service';
import { DbController } from './db.controller';
import { DbScheduler } from './db.scheduler';
import { TransactionManagerService } from './transaction-manager.service';

@Module({
  controllers: [DbController],
  providers: [DbService, DbScheduler, TransactionManagerService],
  exports: [TransactionManagerService],
})
export class DbModule {}

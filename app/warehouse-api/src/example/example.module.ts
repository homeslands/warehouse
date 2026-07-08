import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';
import { Example } from './example.entity';
import { ExampleProfile } from './example.mapper';

@Module({
  imports: [TypeOrmModule.forFeature([Example])],
  controllers: [ExampleController],
  providers: [ExampleService, ExampleProfile],
  exports: [ExampleService],
})
export class ExampleModule {}

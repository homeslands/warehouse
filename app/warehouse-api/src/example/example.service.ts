import { Inject, Injectable, Logger } from '@nestjs/common';
import { FindManyOptions, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  CreateExampleRequestDto,
  ExampleResponseDto,
  GetAllExampleRequestDto,
  UpdateExampleRequestDto,
} from './example.dto';
import { Example } from './example.entity';
import { ExampleException } from './example.exception';
import { ExampleValidation } from './example.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';

@Injectable()
export class ExampleService {
  constructor(
    @InjectRepository(Example) private readonly exampleRepository: Repository<Example>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  async createExample(dto: CreateExampleRequestDto): Promise<ExampleResponseDto> {
    const context = `${ExampleService.name}.${this.createExample.name}`;
    const data = this.mapper.map(dto, CreateExampleRequestDto, Example);
    const existed = await this.exampleRepository.findOneBy({ name: data.name });
    if (existed) throw new ExampleException(ExampleValidation.EXAMPLE_NAME_DOES_EXIST);

    const created = await this.exampleRepository.save(this.exampleRepository.create(data));
    this.logger.log(`Example created: ${created.id}`, context);
    return this.mapper.map(created, Example, ExampleResponseDto);
  }

  async findAll(
    query: GetAllExampleRequestDto,
  ): Promise<AppPaginatedResponseDto<ExampleResponseDto>> {
    const options: FindManyOptions<Example> = {
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    };
    const [items, total] = await this.exampleRepository.findAndCount(options);
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, Example, ExampleResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<ExampleResponseDto>;
  }

  async findOne(slug: string): Promise<ExampleResponseDto> {
    const example = await this.exampleRepository.findOneBy({ slug });
    if (!example) throw new ExampleException(ExampleValidation.EXAMPLE_NOT_FOUND);
    return this.mapper.map(example, Example, ExampleResponseDto);
  }

  async updateExample(slug: string, dto: UpdateExampleRequestDto): Promise<ExampleResponseDto> {
    const example = await this.exampleRepository.findOne({
      where: { slug },
      lock: { mode: 'optimistic', version: dto.version },
    });
    if (!example) throw new ExampleException(ExampleValidation.EXAMPLE_NOT_FOUND);

    const data = this.mapper.map(dto, UpdateExampleRequestDto, Example);
    if (data.name !== example.name) {
      const existed = await this.exampleRepository.findOneBy({ name: data.name });
      if (existed) throw new ExampleException(ExampleValidation.EXAMPLE_NAME_DOES_EXIST);
    }

    Object.assign(example, data);
    const updated = await this.exampleRepository.save(example);
    return this.mapper.map(updated, Example, ExampleResponseDto);
  }

  async deleteExample(slug: string): Promise<number> {
    const example = await this.exampleRepository.findOneBy({ slug });
    if (!example) throw new ExampleException(ExampleValidation.EXAMPLE_NOT_FOUND);
    await this.exampleRepository.softRemove(example);
    return 1;
  }
}

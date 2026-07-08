import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ExampleService } from './example.service';
import { ExampleProfile } from './example.mapper';
import { Example } from './example.entity';
import { ExampleException } from './example.exception';

describe('ExampleService', () => {
  let service: ExampleService;
  const exampleRepository = {
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    softRemove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExampleService,
        ExampleProfile,
        { provide: getRepositoryToken(Example), useValue: exampleRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();
    await module.init();

    service = module.get<ExampleService>(ExampleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createExample', () => {
    it('creates a new example when name does not exist', async () => {
      exampleRepository.findOneBy.mockResolvedValue(null);
      exampleRepository.create.mockImplementation((data) => data);
      exampleRepository.save.mockResolvedValue({ id: '1', name: 'Example A' });

      const result = await service.createExample({ name: 'Example A' });

      expect(result).toMatchObject({ name: 'Example A' });
      expect(exampleRepository.save).toHaveBeenCalled();
    });

    it('throws when example name already exists', async () => {
      exampleRepository.findOneBy.mockResolvedValue({ id: '1', name: 'Example A' });

      await expect(service.createExample({ name: 'Example A' })).rejects.toBeInstanceOf(
        ExampleException,
      );
    });
  });

  describe('findOne', () => {
    it('throws when example is not found', async () => {
      exampleRepository.findOneBy.mockResolvedValue(null);

      await expect(service.findOne('missing-slug')).rejects.toBeInstanceOf(ExampleException);
    });
  });
});

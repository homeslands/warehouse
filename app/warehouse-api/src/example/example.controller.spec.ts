import { Test, TestingModule } from '@nestjs/testing';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';

describe('ExampleController', () => {
  let controller: ExampleController;
  const exampleService = {
    createExample: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateExample: jest.fn(),
    deleteExample: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExampleController],
      providers: [{ provide: ExampleService, useValue: exampleService }],
    }).compile();

    controller = module.get<ExampleController>(ExampleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('wraps createExample result in AppResponseDto', async () => {
    exampleService.createExample.mockResolvedValue({ id: '1', name: 'Example A' });

    const response = await controller.createExample({ name: 'Example A' });

    expect(response.result).toEqual({ id: '1', name: 'Example A' });
    expect(response.statusCode).toBe(201);
  });

  it('wraps findOne result in AppResponseDto', async () => {
    exampleService.findOne.mockResolvedValue({ id: '1', name: 'Example A' });

    const response = await controller.findOne('example-abc123');

    expect(exampleService.findOne).toHaveBeenCalledWith('example-abc123');
    expect(response.result).toEqual({ id: '1', name: 'Example A' });
  });
});

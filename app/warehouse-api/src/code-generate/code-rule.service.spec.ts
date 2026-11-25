import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getMapperToken } from '@automapper/nestjs';
import { createMapper } from '@automapper/core';
import { classes } from '@automapper/classes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { CodeRuleService } from './code-rule.service';
import { CodeRuleProfile } from './code-rule.mapper';
import { CodeRule } from './code-rule.entity';
import { CodeType } from './code-generate.constants';
import { CodeGenerateException } from './code-generate.exception';
import { CodeGenerateValidation } from './code-generate.validation';

const rule = (overrides: Partial<CodeRule> = {}): CodeRule =>
  ({
    type: CodeType.Item,
    prefix: 'IT',
    description: 'Material code',
    updatedAt: new Date('2026-11-23T00:00:00Z'),
    ...overrides,
  }) as CodeRule;

const expectError = async (promise: Promise<unknown>, code: number) => {
  await expect(promise).rejects.toBeInstanceOf(CodeGenerateException);
  await expect(promise).rejects.toMatchObject({ code });
};

describe('CodeRuleService', () => {
  let service: CodeRuleService;
  const codeRuleRepository = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodeRuleService,
        CodeRuleProfile,
        { provide: getRepositoryToken(CodeRule), useValue: codeRuleRepository },
        { provide: getMapperToken(), useValue: createMapper({ strategyInitializer: classes() }) },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: { log: jest.fn() } },
      ],
    }).compile();
    await module.init();
    service = module.get(CodeRuleService);
  });

  it('lists every rule ordered by type', async () => {
    codeRuleRepository.find.mockResolvedValue([rule()]);

    const result = await service.findAll();

    expect(codeRuleRepository.find).toHaveBeenCalledWith({ order: { type: 'ASC' } });
    expect(result).toEqual([
      expect.objectContaining({ type: CodeType.Item, prefix: 'IT', description: 'Material code' }),
    ]);
    expect(typeof result[0].updatedAt).toBe('string');
  });

  it('finds a rule by type case-insensitively', async () => {
    codeRuleRepository.findOneBy.mockResolvedValue(rule());

    await service.findOne('item');

    expect(codeRuleRepository.findOneBy).toHaveBeenCalledWith({ type: CodeType.Item });
  });

  it('rejects an unknown type without querying', async () => {
    await expectError(service.findOne('NOPE'), CodeGenerateValidation.CODE_RULE_TYPE_INVALID.code);
    expect(codeRuleRepository.findOneBy).not.toHaveBeenCalled();
  });

  it('reports a known type that was never seeded', async () => {
    codeRuleRepository.findOneBy.mockResolvedValue(null);
    await expectError(service.findOne('SHELF'), CodeGenerateValidation.CODE_RULE_NOT_FOUND.code);
  });

  describe('updateCodeRule — partial (PATCH)', () => {
    beforeEach(() => {
      codeRuleRepository.save.mockImplementation(async (data) => data);
    });

    it('changes only the prefix when only prefix is sent', async () => {
      codeRuleRepository.findOneBy.mockResolvedValue(rule());

      const result = await service.updateCodeRule('ITEM', { prefix: 'VT' });

      expect(codeRuleRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: 'VT', description: 'Material code' }),
      );
      expect(result.prefix).toBe('VT');
    });

    it('changes only the description when only description is sent', async () => {
      codeRuleRepository.findOneBy.mockResolvedValue(rule());

      await service.updateCodeRule('ITEM', { description: 'Vật tư' });

      expect(codeRuleRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: 'IT', description: 'Vật tư' }),
      );
    });

    it('accepts a 2-digit prefix for BARCODE', async () => {
      codeRuleRepository.findOneBy.mockResolvedValue(
        rule({ type: CodeType.Barcode, prefix: '20' }),
      );

      await service.updateCodeRule('BARCODE', { prefix: '21' });

      expect(codeRuleRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: '21' }),
      );
    });

    it('rejects a letter prefix for BARCODE (EAN-13 is digits only)', async () => {
      codeRuleRepository.findOneBy.mockResolvedValue(
        rule({ type: CodeType.Barcode, prefix: '20' }),
      );

      await expectError(
        service.updateCodeRule('BARCODE', { prefix: 'AB' }),
        CodeGenerateValidation.CODE_RULE_PREFIX_INVALID.code,
      );
      expect(codeRuleRepository.save).not.toHaveBeenCalled();
    });
  });
});

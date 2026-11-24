import { Test, TestingModule } from '@nestjs/testing';
import { CodeRuleController } from './code-rule.controller';
import { CodeRuleService } from './code-rule.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';

describe('CodeRuleController', () => {
  let controller: CodeRuleController;
  const codeRuleService = { findAll: jest.fn(), findOne: jest.fn(), updateCodeRule: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CodeRuleController],
      providers: [{ provide: CodeRuleService, useValue: codeRuleService }],
    }).compile();
    controller = module.get(CodeRuleController);
  });

  it('updateCodeRule passes the type and body to the service', async () => {
    codeRuleService.updateCodeRule.mockResolvedValue({ type: 'BARCODE', prefix: '21' });

    const response = await controller.updateCodeRule('BARCODE', { prefix: '21' });

    expect(codeRuleService.updateCodeRule).toHaveBeenCalledWith('BARCODE', { prefix: '21' });
    expect(response).toMatchObject({ statusCode: 200, result: { prefix: '21' } });
  });

  // Gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập.
  it('maps every route to its authority code', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);

    expect(authority(controller.findAll)).toEqual([AuthorityCode.CodeRuleRead]);
    expect(authority(controller.findOne)).toEqual([AuthorityCode.CodeRuleRead]);
    expect(authority(controller.updateCodeRule)).toEqual([AuthorityCode.CodeRuleUpdate]);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { BarcodeController } from './barcode.controller';
import { BarcodeService } from './barcode.service';
import { REQUIRE_AUTHORITY_KEY } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';

describe('BarcodeController', () => {
  let controller: BarcodeController;
  const barcodeService = { generateMaterialBarcode: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BarcodeController],
      providers: [{ provide: BarcodeService, useValue: barcodeService }],
    }).compile();
    controller = module.get(BarcodeController);
  });

  it('generateMaterialBarcode wraps the generated barcode in a 201 response', async () => {
    const generated = { barcode: '2000100000014' };
    barcodeService.generateMaterialBarcode.mockResolvedValue(generated);

    const response = await controller.generateMaterialBarcode('wh-slug-1');

    expect(barcodeService.generateMaterialBarcode).toHaveBeenCalledWith('wh-slug-1');
    expect(response).toMatchObject({ statusCode: 201, result: generated });
  });

  // Gỡ/sửa nhầm decorator là mở endpoint cho mọi user đã đăng nhập.
  it('maps every route to its authority code', () => {
    const authority = (handler: (...args: never[]) => unknown): string[] | undefined =>
      Reflect.getMetadata(REQUIRE_AUTHORITY_KEY, handler);

    expect(authority(controller.generateMaterialBarcode)).toEqual([
      AuthorityCode.MaterialCreate,
      AuthorityCode.MaterialUpdate,
      AuthorityCode.WarehouseUpdate,
    ]);
  });
});

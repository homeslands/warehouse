import { Inject, Injectable, Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { GenerateMaterialBarcodeResponseDto } from './barcode.dto';
import { CodeGenerateService } from './code-generate.service';
import { CodeType } from './code-generate.constants';
import { Warehouse } from 'src/warehouse/warehouse.entity';
import { findWarehouse } from 'src/warehouse/warehouse.util';
import { InventoryException } from 'src/inventory/inventory.exception';
import { InventoryValidation } from 'src/inventory/inventory.validation';
import { TransactionManagerService } from 'src/db/transaction-manager.service';

@Injectable()
export class BarcodeService {
  constructor(
    @InjectRepository(Warehouse) private readonly warehouseRepository: Repository<Warehouse>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
    private readonly transactionManager: TransactionManagerService,
    private readonly codeGenerateService: CodeGenerateService,
  ) {}

  /**
   * Cấp trước mã vạch EAN-13 (`CodeType.Barcode`) cho vật tư mới sắp gán vào kho này — dùng khi sản
   * phẩm không có mã vạch của nhà sản xuất. Chỉ cấp, KHÔNG tạo vật tư: client in tem rồi gửi lại ở
   * `material.barcode` của `POST /warehouses/:slug/materials`. Không cấp mã vật tư ở đây: `code` tự
   * sinh lúc tạo vật tư. Số cấp ra mà không dùng thì bỏ trống, bộ đếm không bao giờ cấp lại.
   *
   * Kho ngừng hoạt động giữ mã lỗi `INVENTORY_WAREHOUSE_INACTIVE` như lúc endpoint còn ở module
   * `inventory` — không đổi contract.
   */
  async generateMaterialBarcode(
    warehouseSlug: string,
  ): Promise<GenerateMaterialBarcodeResponseDto> {
    const context = `${BarcodeService.name}.${this.generateMaterialBarcode.name}`;
    const warehouse = await findWarehouse(this.warehouseRepository, warehouseSlug);
    if (!warehouse.isActive)
      throw new InventoryException(InventoryValidation.INVENTORY_WAREHOUSE_INACTIVE);

    const barcode = await this.transactionManager.execute((manager) =>
      this.codeGenerateService.generate(manager, CodeType.Barcode, warehouse),
    );
    this.logger.log(`Barcode generated for warehouse ${warehouse.id}: ${barcode}`, context);
    return { barcode };
  }
}

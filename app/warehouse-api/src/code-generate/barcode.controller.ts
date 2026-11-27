import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { HttpStatus, HttpCode, Post, Controller, Param } from '@nestjs/common';
import { GenerateMaterialBarcodeResponseDto } from './barcode.dto';
import { BarcodeService } from './barcode.service';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { AppResponseDto } from 'src/app/app.dto';

/**
 * Cấp mã vạch cho vật tư mới của kho: `POST /warehouses/:slug/barcode` (trước là
 * `/warehouses/:slug/materials/barcode`, tag `Inventory`).
 */
@ApiTags('Code Rule')
@Controller('warehouses/:warehouseSlug')
@ApiBearerAuth()
@ApiParam({ name: 'warehouseSlug', required: true, example: 'x7fk2p9qab' })
export class BarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  // Cấp mã vạch cho vật tư MỚI sắp tạo + gán vào kho ⇒ cùng bộ quyền với
  // `POST /warehouses/:slug/materials`.
  @Post('barcode')
  @RequireAuthority(
    AuthorityCode.MaterialCreate,
    AuthorityCode.MaterialUpdate,
    AuthorityCode.WarehouseUpdate,
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate an EAN-13 barcode for a new material of this warehouse',
    description:
      'For products without a manufacturer barcode. Only issues the number — send it back as ' +
      '`material.barcode` of `POST /warehouses/{warehouseSlug}/materials`.',
  })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Generated',
    type: GenerateMaterialBarcodeResponseDto,
  })
  async generateMaterialBarcode(@Param('warehouseSlug') warehouseSlug: string) {
    const result = await this.barcodeService.generateMaterialBarcode(warehouseSlug);
    return {
      message: 'Barcode has been generated successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<GenerateMaterialBarcodeResponseDto>;
  }
}

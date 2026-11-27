import { ApiProperty } from '@nestjs/swagger';

/**
 * `POST /warehouses/:slug/barcode` — mã vạch EAN-13 cấp sẵn cho vật tư MỚI (không có mã
 * vạch của nhà sản xuất) sắp tạo + gán vào kho này. Client gửi lại ở `material.barcode` của
 * `POST /warehouses/:slug/materials`; mã vật tư thì để trống cho server tự sinh lúc tạo.
 */
export class GenerateMaterialBarcodeResponseDto {
  @ApiProperty({ description: 'Generated EAN-13 barcode', example: '2000100000014' })
  barcode: string;
}

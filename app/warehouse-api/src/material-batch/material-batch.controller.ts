import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { GetAllMaterialBatchRequestDto, MaterialBatchResponseDto } from './material-batch.dto';
import { MaterialBatchService } from './material-batch.service';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { WarehouseScope } from 'src/warehouse/decorator/warehouse-scope.decorator';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

/**
 * Lô hàng của kho — CHỈ ĐỌC. Lô sinh ra khi xác nhận phiếu nhập và giảm khi xác nhận phiếu xuất,
 * không có route tạo/sửa/xoá. Quyền đọc dùng chung với tồn kho (`MATERIAL_READ` + `WAREHOUSE_READ`).
 */
@ApiTags('Material Batch')
@Controller('warehouses/:warehouseSlug/material-batches')
@ApiBearerAuth()
@ApiParam({ name: 'warehouseSlug', required: true, example: 'x7fk2p9qab' })
@WarehouseScope('warehouseSlug')
export class MaterialBatchController {
  constructor(private readonly materialBatchService: MaterialBatchService) {}

  @Get()
  @RequireAuthority(AuthorityCode.MaterialRead, AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get the material batches of this warehouse (paginated, filter by materialSlug / status / ' +
      'expiryBefore; sortBy = createdAt | expiryDate | entryDate)',
  })
  @ApiPaginatedResponse(MaterialBatchResponseDto, 'Retrieved')
  async findAll(
    @Param('warehouseSlug') warehouseSlug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllMaterialBatchRequestDto,
  ) {
    const result = await this.materialBatchService.findAll(warehouseSlug, query);
    return {
      message: 'Material batches have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<MaterialBatchResponseDto>>;
  }

  @Get(':slug')
  @RequireAuthority(AuthorityCode.MaterialRead, AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a material batch by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: MaterialBatchResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findOne(@Param('warehouseSlug') warehouseSlug: string, @Param('slug') slug: string) {
    const result = await this.materialBatchService.findOne(warehouseSlug, slug);
    return {
      message: 'Material batch has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaterialBatchResponseDto>;
  }
}

import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import {
  HttpStatus,
  HttpCode,
  Post,
  Body,
  Controller,
  ValidationPipe,
  Get,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import {
  AdjustWarehouseMaterialQuantityRequestDto,
  AssignWarehouseMaterialRequestDto,
  GetWarehouseMaterialRequestDto,
  UpdateWarehouseMaterialRequestDto,
  WarehouseMaterialResponseDto,
} from './warehouse-material.dto';
import { WarehouseMaterialService } from './warehouse-material.service';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('Warehouse Material')
@Controller('warehouses/:warehouseSlug/materials')
@ApiBearerAuth()
@ApiParam({ name: 'warehouseSlug', required: true, example: 'x7fk2p9qab' })
export class WarehouseMaterialController {
  constructor(private readonly warehouseMaterialService: WarehouseMaterialService) {}

  @Post()
  @RequireAuthority(AuthorityCode.MaterialUpdate, AuthorityCode.WarehouseUpdate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign a material to this warehouse' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Assigned',
    type: WarehouseMaterialResponseDto,
  })
  async assignMaterial(
    @Param('warehouseSlug') warehouseSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: AssignWarehouseMaterialRequestDto,
  ) {
    const result = await this.warehouseMaterialService.assignMaterial(warehouseSlug, requestData);
    return {
      message: 'Material has been assigned to the warehouse successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseMaterialResponseDto>;
  }

  @Get()
  @RequireAuthority(AuthorityCode.MaterialRead, AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the materials of this warehouse with their stock (paginated)' })
  @ApiPaginatedResponse(WarehouseMaterialResponseDto, 'Retrieved')
  async findAll(
    @Param('warehouseSlug') warehouseSlug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetWarehouseMaterialRequestDto,
  ) {
    const result = await this.warehouseMaterialService.findAll(warehouseSlug, query);
    return {
      message: 'Warehouse materials have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<WarehouseMaterialResponseDto>>;
  }

  @Patch(':materialSlug')
  @RequireAuthority(AuthorityCode.MaterialUpdate, AuthorityCode.WarehouseUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update the per-warehouse inventory thresholds (không đụng tồn)',
    description:
      'Gửi `null` cho 1 vế để bỏ override và quay về ngưỡng mặc định của Material. Không gửi field ' +
      'nào thì vế đó giữ nguyên. Sửa tồn thì dùng `PATCH .../quantity`.',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Updated',
    type: WarehouseMaterialResponseDto,
  })
  @ApiParam({ name: 'materialSlug', required: true, example: 'x7fk2p9qab' })
  async updateThresholds(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('materialSlug') materialSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateWarehouseMaterialRequestDto,
  ) {
    const result = await this.warehouseMaterialService.updateThresholds(
      warehouseSlug,
      materialSlug,
      requestData,
    );
    return {
      message: 'Warehouse material thresholds have been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseMaterialResponseDto>;
  }

  @Patch(':materialSlug/quantity')
  @RequireAuthority(AuthorityCode.MaterialUpdate, AuthorityCode.WarehouseUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Adjust the stock quantity by a delta',
    description:
      'Cộng/trừ tồn bằng 1 câu UPDATE nguyên tử — 2 lần điều chỉnh đồng thời không ghi đè nhau. ' +
      '`delta` là số nguyên khác 0; nếu làm tồn âm thì bị từ chối. Đây là cửa TẠM khi chưa có ' +
      'phiếu nhập/xuất kho.',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Adjusted',
    type: WarehouseMaterialResponseDto,
  })
  @ApiParam({ name: 'materialSlug', required: true, example: 'x7fk2p9qab' })
  async adjustQuantity(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('materialSlug') materialSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: AdjustWarehouseMaterialQuantityRequestDto,
  ) {
    const result = await this.warehouseMaterialService.adjustQuantity(
      warehouseSlug,
      materialSlug,
      requestData,
    );
    return {
      message: 'Stock quantity has been adjusted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseMaterialResponseDto>;
  }

  @Delete(':materialSlug')
  @RequireAuthority(AuthorityCode.MaterialUpdate, AuthorityCode.WarehouseUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a material from this warehouse (chặn nếu tồn > 0)' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Removed', type: String })
  @ApiParam({ name: 'materialSlug', required: true, example: 'x7fk2p9qab' })
  async removeMaterial(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('materialSlug') materialSlug: string,
  ) {
    const result = await this.warehouseMaterialService.removeMaterial(warehouseSlug, materialSlug);
    return {
      message: 'Material has been removed from the warehouse successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} warehouse material have been removed successfully`,
    } as AppResponseDto<string>;
  }
}

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
  AdjustInventoryQuantityRequestDto,
  AssignInventoryRequestDto,
  GetInventoryHistoryRequestDto,
  GetInventoryRequestDto,
  InventoryHistoryResponseDto,
  UpdateInventoryRequestDto,
  InventoryResponseDto,
} from './inventory.dto';
import { InventoryService } from './inventory.service';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { CurrentUser, CurrentUserDto } from 'src/user/user.decorator';

@ApiTags('Inventory')
@Controller('warehouses/:warehouseSlug/materials')
@ApiBearerAuth()
@ApiParam({ name: 'warehouseSlug', required: true, example: 'x7fk2p9qab' })
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @RequireAuthority(AuthorityCode.MaterialUpdate, AuthorityCode.WarehouseUpdate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Assign a material to this warehouse' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Assigned',
    type: InventoryResponseDto,
  })
  async assignMaterial(
    @Param('warehouseSlug') warehouseSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: AssignInventoryRequestDto,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.inventoryService.assignMaterial(
      warehouseSlug,
      requestData,
      currentUser,
    );
    return {
      message: 'Material has been assigned to the warehouse successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<InventoryResponseDto>;
  }

  @Get()
  @RequireAuthority(AuthorityCode.MaterialRead, AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the materials of this warehouse with their stock (paginated)' })
  @ApiPaginatedResponse(InventoryResponseDto, 'Retrieved')
  async findAll(
    @Param('warehouseSlug') warehouseSlug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetInventoryRequestDto,
  ) {
    const result = await this.inventoryService.findAll(warehouseSlug, query);
    return {
      message: 'Inventories have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<InventoryResponseDto>>;
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
    type: InventoryResponseDto,
  })
  @ApiParam({ name: 'materialSlug', required: true, example: 'x7fk2p9qab' })
  async updateThresholds(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('materialSlug') materialSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateInventoryRequestDto,
  ) {
    const result = await this.inventoryService.updateThresholds(
      warehouseSlug,
      materialSlug,
      requestData,
    );
    return {
      message: 'Inventory thresholds have been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<InventoryResponseDto>;
  }

  @Patch(':materialSlug/quantity')
  @RequireAuthority(AuthorityCode.MaterialUpdate, AuthorityCode.WarehouseUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Adjust the stock quantity by a delta',
    description:
      'Cộng/trừ tồn dưới khoá `SELECT ... FOR UPDATE` — 2 lần điều chỉnh đồng thời chạy nối tiếp, ' +
      'không ghi đè nhau; mỗi lần ghi 1 dòng lịch sử `ADJUST`. `delta` là số khác 0 (tối đa 6 chữ ' +
      'số thập phân); làm tồn âm hoặc thấp hơn lượng đã giữ chỗ thì bị từ chối. Đây là cửa TẠM ' +
      'khi chưa có phiếu nhập/xuất kho.',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Adjusted',
    type: InventoryResponseDto,
  })
  @ApiParam({ name: 'materialSlug', required: true, example: 'x7fk2p9qab' })
  async adjustQuantity(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('materialSlug') materialSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: AdjustInventoryQuantityRequestDto,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.inventoryService.adjustQuantity(
      warehouseSlug,
      materialSlug,
      requestData,
      currentUser,
    );
    return {
      message: 'Stock quantity has been adjusted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<InventoryResponseDto>;
  }

  @Delete(':materialSlug')
  @RequireAuthority(AuthorityCode.MaterialUpdate, AuthorityCode.WarehouseUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove a material from this warehouse (chặn nếu tồn > 0 hoặc còn giữ chỗ)',
  })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Removed', type: String })
  @ApiParam({ name: 'materialSlug', required: true, example: 'x7fk2p9qab' })
  async removeMaterial(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('materialSlug') materialSlug: string,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.inventoryService.removeMaterial(
      warehouseSlug,
      materialSlug,
      currentUser,
    );
    return {
      message: 'Material has been removed from the warehouse successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} inventory have been removed successfully`,
    } as AppResponseDto<string>;
  }

  @Get(':materialSlug/histories')
  @RequireAuthority(AuthorityCode.MaterialRead, AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the stock change history of a material in this warehouse' })
  @ApiPaginatedResponse(InventoryHistoryResponseDto, 'Retrieved')
  @ApiParam({ name: 'materialSlug', required: true, example: 'x7fk2p9qab' })
  async findHistories(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('materialSlug') materialSlug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetInventoryHistoryRequestDto,
  ) {
    const result = await this.inventoryService.findHistories(warehouseSlug, materialSlug, query);
    return {
      message: 'Inventory histories have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<InventoryHistoryResponseDto>>;
  }
}

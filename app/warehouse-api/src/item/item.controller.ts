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
import { GetAllItemRequestDto, ItemResponseDto } from './item.dto';
import { ItemService } from './item.service';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { WarehouseScope } from 'src/warehouse/decorator/warehouse-scope.decorator';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

/**
 * Item (đơn vị hàng) của kho — CHỈ ĐỌC. Item sinh ra khi thêm vào phiếu nhập, giảm khi
 * xác nhận phiếu xuất, không có route tạo/sửa/xoá. Quyền đọc dùng chung với tồn kho (`MATERIAL_READ` + `WAREHOUSE_READ`).
 */
@ApiTags('Item')
@Controller('warehouses/:warehouseSlug/items')
@ApiBearerAuth()
@ApiParam({ name: 'warehouseSlug', required: true, example: 'x7fk2p9qab' })
@WarehouseScope('warehouseSlug')
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Get()
  @RequireAuthority(AuthorityCode.MaterialRead, AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get the items (units of goods) of this warehouse (paginated, filter by materialSlug / status / ' +
      'expiryBefore; sortBy = createdAt | expiryDate | entryDate)',
  })
  @ApiPaginatedResponse(ItemResponseDto, 'Retrieved')
  async findAll(
    @Param('warehouseSlug') warehouseSlug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllItemRequestDto,
  ) {
    const result = await this.itemService.findAll(warehouseSlug, query);
    return {
      message: 'Items have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<ItemResponseDto>>;
  }

  @Get(':slug')
  @RequireAuthority(AuthorityCode.MaterialRead, AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get an item by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: ItemResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findOne(@Param('warehouseSlug') warehouseSlug: string, @Param('slug') slug: string) {
    const result = await this.itemService.findOne(warehouseSlug, slug);
    return {
      message: 'Item has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ItemResponseDto>;
  }
}

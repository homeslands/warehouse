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
  Put,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import {
  AssignWarehouseManagerRequestDto,
  CreateWarehouseRequestDto,
  GetAllWarehouseRequestDto,
  GetMyWarehouseRequestDto,
  UpdateWarehouseRequestDto,
  WarehouseResponseDto,
} from './warehouse.dto';
import { WarehouseService } from './warehouse.service';
import { AuthorityCode } from 'src/authority/authority.constants';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { CurrentUser, CurrentUserDto } from 'src/user/user.decorator';

@ApiTags('Warehouse')
@Controller('warehouses')
@ApiBearerAuth()
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  @RequireAuthority(AuthorityCode.WarehouseCreate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new warehouse' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: WarehouseResponseDto,
  })
  async createWarehouse(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateWarehouseRequestDto,
  ) {
    const result = await this.warehouseService.createWarehouse(requestData);
    return {
      message: 'Warehouse has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseResponseDto>;
  }

  @Get()
  @RequireAuthority(AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all warehouses (paginated)' })
  @ApiPaginatedResponse(WarehouseResponseDto, 'Retrieved')
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllWarehouseRequestDto,
  ) {
    const result = await this.warehouseService.findAll(query);
    return {
      message: 'All warehouses have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<WarehouseResponseDto>>;
  }

  // PHẢI khai TRƯỚC `@Get(':slug')`, nếu không route `:slug` nuốt mất đường dẫn `mine`.
  // Không gắn `@RequireAuthority`: chỉ cần JWT hợp lệ, và service đã tự giới hạn theo `userId`.
  @Get('mine')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get warehouses managed by the current user (paginated)' })
  @ApiPaginatedResponse(WarehouseResponseDto, 'Retrieved')
  async findMine(
    @CurrentUser() user: CurrentUserDto,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetMyWarehouseRequestDto,
  ) {
    const result = await this.warehouseService.findMine(user.userId, query);
    return {
      message: 'Managed warehouses have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<WarehouseResponseDto>>;
  }

  @Get(':slug')
  @RequireAuthority(AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a warehouse by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: WarehouseResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findOne(@Param('slug') slug: string) {
    const result = await this.warehouseService.findOne(slug);
    return {
      message: 'Warehouse has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseResponseDto>;
  }

  @Patch(':slug')
  @RequireAuthority(AuthorityCode.WarehouseUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a warehouse' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Updated',
    type: WarehouseResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async updateWarehouse(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateWarehouseRequestDto,
  ) {
    const result = await this.warehouseService.updateWarehouse(slug, requestData);
    return {
      message: 'Warehouse has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseResponseDto>;
  }

  // `PUT` chứ không `PATCH`/`DELETE`: nó thay thế đúng 1 slot manager và idempotent, còn
  // `managerSlug: null` gỡ phân công ngay trong cùng code path.
  @Put(':slug/manager')
  @RequireAuthority(AuthorityCode.WarehouseAssignManager)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign (or unassign with null) the manager of a warehouse' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Assigned',
    type: WarehouseResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async assignManager(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: AssignWarehouseManagerRequestDto,
  ) {
    const result = await this.warehouseService.assignManager(slug, requestData);
    return {
      message: 'Warehouse manager has been assigned successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseResponseDto>;
  }

  @Delete(':slug')
  @RequireAuthority(AuthorityCode.WarehouseDelete)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a warehouse' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async deleteWarehouse(@Param('slug') slug: string) {
    const result = await this.warehouseService.deleteWarehouse(slug);
    return {
      message: 'Warehouse has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} warehouse have been deleted successfully`,
    } as AppResponseDto<string>;
  }
}

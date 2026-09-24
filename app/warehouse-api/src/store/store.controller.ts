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
  Put,
} from '@nestjs/common';
import {
  AssignStoreWarehouseRequestDto,
  CreateStoreRequestDto,
  GetAllStoreRequestDto,
  StoreResponseDto,
  UpdateStoreRequestDto,
} from './store.dto';
import { StoreService } from './store.service';
import { HasRole } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('Store')
@Controller('stores')
@ApiBearerAuth()
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post()
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new store' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: StoreResponseDto,
  })
  async createStore(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateStoreRequestDto,
  ) {
    const result = await this.storeService.createStore(requestData);
    return {
      message: 'Store has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<StoreResponseDto>;
  }

  @Get()
  @HasRole(RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all stores (paginated)' })
  @ApiPaginatedResponse(StoreResponseDto, 'Retrieved')
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllStoreRequestDto,
  ) {
    const result = await this.storeService.findAll(query);
    return {
      message: 'All stores have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<StoreResponseDto>>;
  }

  @Get(':slug')
  @HasRole(RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a store by slug' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Retrieved', type: StoreResponseDto })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findOne(@Param('slug') slug: string) {
    const result = await this.storeService.findOne(slug);
    return {
      message: 'Store has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<StoreResponseDto>;
  }

  @Patch(':slug')
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a store' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Updated', type: StoreResponseDto })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async updateStore(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateStoreRequestDto,
  ) {
    const result = await this.storeService.updateStore(slug, requestData);
    return {
      message: 'Store has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<StoreResponseDto>;
  }

  // `PUT` chứ không `PATCH`/`DELETE`: nó thay thế đúng 1 slot warehouse và idempotent, còn
  // `warehouseSlug: null` gỡ gắn kết ngay trong cùng code path (giống `PUT /warehouses/:slug/manager`).
  @Put(':slug/warehouse')
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign (or unassign with null) the warehouse of a store' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Assigned', type: StoreResponseDto })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async assignWarehouse(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: AssignStoreWarehouseRequestDto,
  ) {
    const result = await this.storeService.assignWarehouse(slug, requestData);
    return {
      message: 'Store warehouse has been assigned successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<StoreResponseDto>;
  }

  @Delete(':slug')
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a store' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async deleteStore(@Param('slug') slug: string) {
    const result = await this.storeService.deleteStore(slug);
    return {
      message: 'Store has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} store have been deleted successfully`,
    } as AppResponseDto<string>;
  }
}

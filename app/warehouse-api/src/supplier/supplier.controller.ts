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
  CreateSupplierRequestDto,
  GetAllSupplierRequestDto,
  GetSupplierMaterialRequestDto,
  SupplierMaterialResponseDto,
  SupplierMaterialSlugsRequestDto,
  SupplierResponseDto,
  UpdateSupplierRequestDto,
} from './supplier.dto';
import { SupplierService } from './supplier.service';
import { AuthorityCode } from 'src/authority/authority.constants';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('Supplier')
@Controller('suppliers')
@ApiBearerAuth()
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Post()
  @RequireAuthority(AuthorityCode.SupplierCreate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new supplier' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: SupplierResponseDto,
  })
  async createSupplier(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateSupplierRequestDto,
  ) {
    const result = await this.supplierService.createSupplier(requestData);
    return {
      message: 'Supplier has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<SupplierResponseDto>;
  }

  @Get()
  @RequireAuthority(AuthorityCode.SupplierRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get all suppliers (paginated, filter by code / taxCode / search(name|contactPerson|email) / phonenumber)',
  })
  @ApiPaginatedResponse(SupplierResponseDto, 'Retrieved')
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllSupplierRequestDto,
  ) {
    const result = await this.supplierService.findAll(query);
    return {
      message: 'All suppliers have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<SupplierResponseDto>>;
  }

  @Get(':slug')
  @RequireAuthority(AuthorityCode.SupplierRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a supplier by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: SupplierResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findOne(@Param('slug') slug: string) {
    const result = await this.supplierService.findOne(slug);
    return {
      message: 'Supplier has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<SupplierResponseDto>;
  }

  @Patch(':slug')
  @RequireAuthority(AuthorityCode.SupplierUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a supplier (partial)' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Updated', type: SupplierResponseDto })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async updateSupplier(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateSupplierRequestDto,
  ) {
    const result = await this.supplierService.updateSupplier(slug, requestData);
    return {
      message: 'Supplier has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<SupplierResponseDto>;
  }

  @Delete(':slug')
  @RequireAuthority(AuthorityCode.SupplierDelete)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a supplier (must have no materials attached)' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async deleteSupplier(@Param('slug') slug: string) {
    const result = await this.supplierService.deleteSupplier(slug);
    return {
      message: 'Supplier has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} supplier have been deleted successfully`,
    } as AppResponseDto<string>;
  }

  // ---------- Vật tư của nhà cung cấp — route nối 2 tài nguyên ⇒ AND 2 authority ----------

  @Get(':slug/materials')
  @RequireAuthority(AuthorityCode.SupplierRead, AuthorityCode.MaterialRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get materials supplied by a supplier' })
  @ApiPaginatedResponse(SupplierMaterialResponseDto, 'Retrieved')
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findMaterials(
    @Param('slug') slug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetSupplierMaterialRequestDto,
  ) {
    const result = await this.supplierService.findMaterials(slug, query);
    return {
      message: 'Supplier materials have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<SupplierMaterialResponseDto>>;
  }

  @Put(':slug/materials')
  @RequireAuthority(AuthorityCode.SupplierUpdate, AuthorityCode.MaterialUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Attach materials to a supplier (batch)',
    description:
      'All-or-nothing: if any slug does not exist (`MATERIAL_NOT_FOUND`) or any material already ' +
      'belongs to another supplier (`SUPPLIER_MATERIAL_BELONGS_TO_OTHER_SUPPLIER`), the whole batch ' +
      'is rejected. Materials already attached to this supplier are skipped. Returns every material ' +
      'in the batch.',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Attached',
    type: SupplierMaterialResponseDto,
    isArray: true,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async attachMaterials(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: SupplierMaterialSlugsRequestDto,
  ) {
    const result = await this.supplierService.attachMaterials(slug, requestData);
    return {
      message: 'Materials have been attached to supplier successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<SupplierMaterialResponseDto[]>;
  }

  @Delete(':slug/materials')
  @RequireAuthority(AuthorityCode.SupplierUpdate, AuthorityCode.MaterialUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detach materials from a supplier (batch)',
    description:
      'All-or-nothing: every material in the batch must currently belong to this supplier, ' +
      'otherwise the whole batch is rejected (`SUPPLIER_MATERIAL_NOT_ATTACHED`).',
  })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Detached', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async detachMaterials(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: SupplierMaterialSlugsRequestDto,
  ) {
    const result = await this.supplierService.detachMaterials(slug, requestData);
    return {
      message: 'Materials have been detached from supplier successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} material have been detached successfully`,
    } as AppResponseDto<string>;
  }

  // ---------- Lịch sử giao dịch (append-only) ----------
  // TODO(tech-debt): tạm ẩn `GET/POST :slug/transactions` — người dùng chưa được tự tạo giao dịch.
  // Mở lại khi làm phần phân tích giao dịch của nhà cung cấp; service `findTransactions` /
  // `createTransaction` + entity `SupplierTransaction` vẫn giữ nguyên để nối lại controller.
}

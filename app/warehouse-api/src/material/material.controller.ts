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
  ConvertMaterialQuantityRequestDto,
  CreateMaterialConversionUnitRequestDto,
  CreateMaterialRequestDto,
  GetAllMaterialRequestDto,
  GetConversionUnitRequestDto,
  MaterialConversionResultResponseDto,
  MaterialConversionUnitResponseDto,
  MaterialResponseDto,
  UpdateMaterialConversionUnitRequestDto,
  UpdateMaterialRequestDto,
} from './material.dto';
import { UnitResponseDto } from 'src/unit/unit.dto';
import { MaterialService } from './material.service';
import { HasRole } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('Material')
@Controller('materials')
@ApiBearerAuth()
export class MaterialController {
  constructor(private readonly materialService: MaterialService) {}

  @Post()
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new material' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: MaterialResponseDto,
  })
  async createMaterial(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateMaterialRequestDto,
  ) {
    const result = await this.materialService.createMaterial(requestData);
    return {
      message: 'Material has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaterialResponseDto>;
  }

  @Get()
  @HasRole(RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all materials (paginated)' })
  @ApiPaginatedResponse(MaterialResponseDto, 'Retrieved')
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllMaterialRequestDto,
  ) {
    const result = await this.materialService.findAll(query);
    return {
      message: 'All materials have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<MaterialResponseDto>>;
  }

  @Get(':slug')
  @HasRole(RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a material by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: MaterialResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findOne(@Param('slug') slug: string) {
    const result = await this.materialService.findOne(slug);
    return {
      message: 'Material has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaterialResponseDto>;
  }

  // Route 2 đoạn nên không đụng `@Get(':slug')` ở trên (`:slug` chỉ khớp 1 đoạn path).
  @Get(':slug/conversion-units')
  @HasRole(RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Danh sách đơn vị quy đổi ĐÃ GẮN cho vật tư (kèm tỉ lệ quy đổi)' })
  @ApiPaginatedResponse(MaterialConversionUnitResponseDto, 'Retrieved')
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findConversionUnits(
    @Param('slug') slug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetConversionUnitRequestDto,
  ) {
    const result = await this.materialService.findConversionUnits(slug, query);
    return {
      message: 'Conversion units have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<MaterialConversionUnitResponseDto>>;
  }

  // `available` là literal nên luôn được Nest ưu tiên hơn pattern `:unitSlug` — không có GET nào
  // dùng `:unitSlug` nên cũng không có gì để đụng.
  @Get(':slug/conversion-units/available')
  @HasRole(RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đơn vị CHỌN ĐƯỢC làm đơn vị quy đổi (đã loại đơn vị cơ sở và các unit đã gắn)',
  })
  @ApiPaginatedResponse(UnitResponseDto, 'Retrieved')
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findAvailableConversionUnits(
    @Param('slug') slug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetConversionUnitRequestDto,
  ) {
    const result = await this.materialService.findAvailableConversionUnits(slug, query);
    return {
      message: 'Available conversion units have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<UnitResponseDto>>;
  }

  @Post(':slug/conversion-units')
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Gắn 1 đơn vị quy đổi cho vật tư' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: MaterialConversionUnitResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async addConversionUnit(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateMaterialConversionUnitRequestDto,
  ) {
    const result = await this.materialService.addConversionUnit(slug, requestData);
    return {
      message: 'Conversion unit has been attached successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaterialConversionUnitResponseDto>;
  }

  // POST cho 1 thao tác KHÔNG đổi dữ liệu: tham số đi trong body cho gọn (3 field, có số thập
  // phân), nên quyền để ở mức ĐỌC như các route GET chứ không phải ADMIN.
  @Post(':slug/convert')
  @HasRole(RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Quy đổi số lượng giữa 2 đơn vị của vật tư (qua đơn vị cơ sở)' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Converted',
    type: MaterialConversionResultResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async convertQuantity(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: ConvertMaterialQuantityRequestDto,
  ) {
    const result = await this.materialService.convertQuantity(slug, requestData);
    return {
      message: 'Quantity has been converted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaterialConversionResultResponseDto>;
  }

  @Patch(':slug/conversion-units/:unitSlug')
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sửa tỉ lệ quy đổi của 1 đơn vị quy đổi' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Updated',
    type: MaterialConversionUnitResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  @ApiParam({ name: 'unitSlug', required: true, example: 'unit-abc123' })
  async updateConversionUnit(
    @Param('slug') slug: string,
    @Param('unitSlug') unitSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateMaterialConversionUnitRequestDto,
  ) {
    const result = await this.materialService.updateConversionUnit(slug, unitSlug, requestData);
    return {
      message: 'Conversion unit has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaterialConversionUnitResponseDto>;
  }

  @Delete(':slug/conversion-units/:unitSlug')
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gỡ 1 đơn vị quy đổi khỏi vật tư' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  @ApiParam({ name: 'unitSlug', required: true, example: 'unit-abc123' })
  async removeConversionUnit(@Param('slug') slug: string, @Param('unitSlug') unitSlug: string) {
    const result = await this.materialService.removeConversionUnit(slug, unitSlug);
    return {
      message: 'Conversion unit has been detached successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} conversion unit have been detached successfully`,
    } as AppResponseDto<string>;
  }

  @Patch(':slug')
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a material' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Updated',
    type: MaterialResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async updateMaterial(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateMaterialRequestDto,
  ) {
    const result = await this.materialService.updateMaterial(slug, requestData);
    return {
      message: 'Material has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaterialResponseDto>;
  }

  @Delete(':slug')
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a material (chặn nếu còn được gán vào kho)' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async deleteMaterial(@Param('slug') slug: string) {
    const result = await this.materialService.deleteMaterial(slug);
    return {
      message: 'Material has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} material have been deleted successfully`,
    } as AppResponseDto<string>;
  }
}

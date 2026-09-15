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
  CreateMaterialTypeRequestDto,
  GetAllMaterialTypeRequestDto,
  MaterialTypeResponseDto,
  UpdateMaterialTypeRequestDto,
} from './material-type.dto';
import { MaterialTypeService } from './material-type.service';
import { HasRole } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('Material Type')
@Controller('material-types')
@ApiBearerAuth()
export class MaterialTypeController {
  constructor(private readonly materialTypeService: MaterialTypeService) {}

  @Post()
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new material type' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: MaterialTypeResponseDto,
  })
  async createMaterialType(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateMaterialTypeRequestDto,
  ) {
    const result = await this.materialTypeService.createMaterialType(requestData);
    return {
      message: 'Material type has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaterialTypeResponseDto>;
  }

  @Get()
  @HasRole(RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all material types (paginated)' })
  @ApiPaginatedResponse(MaterialTypeResponseDto, 'Retrieved')
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllMaterialTypeRequestDto,
  ) {
    const result = await this.materialTypeService.findAll(query);
    return {
      message: 'All material types have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<MaterialTypeResponseDto>>;
  }

  @Get(':slug')
  @HasRole(RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a material type by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: MaterialTypeResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findOne(@Param('slug') slug: string) {
    const result = await this.materialTypeService.findOne(slug);
    return {
      message: 'Material type has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaterialTypeResponseDto>;
  }

  @Patch(':slug')
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a material type' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Updated',
    type: MaterialTypeResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async updateMaterialType(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateMaterialTypeRequestDto,
  ) {
    const result = await this.materialTypeService.updateMaterialType(slug, requestData);
    return {
      message: 'Material type has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<MaterialTypeResponseDto>;
  }

  @Delete(':slug')
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a material type (chặn nếu còn material tham chiếu)' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async deleteMaterialType(@Param('slug') slug: string) {
    const result = await this.materialTypeService.deleteMaterialType(slug);
    return {
      message: 'Material type has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} material type have been deleted successfully`,
    } as AppResponseDto<string>;
  }
}

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
  CreateMaterialRequestDto,
  GetAllMaterialRequestDto,
  MaterialResponseDto,
  UpdateMaterialRequestDto,
} from './material.dto';
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

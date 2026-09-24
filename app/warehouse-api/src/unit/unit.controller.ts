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
  CreateUnitRequestDto,
  UnitResponseDto,
  GetAllUnitRequestDto,
  UpdateUnitRequestDto,
} from './unit.dto';
import { UnitService } from './unit.service';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('Unit')
@Controller('units')
@ApiBearerAuth()
export class UnitController {
  constructor(private readonly unitService: UnitService) {}

  @Post()
  @RequireAuthority(AuthorityCode.UnitCreate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new unit' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: UnitResponseDto,
  })
  async createUnit(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateUnitRequestDto,
  ) {
    const result = await this.unitService.createUnit(requestData);
    return {
      message: 'Unit has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UnitResponseDto>;
  }

  @Get()
  @RequireAuthority(AuthorityCode.UnitRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all units (paginated)' })
  @ApiPaginatedResponse(UnitResponseDto, 'Retrieved')
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: GetAllUnitRequestDto,
  ) {
    const result = await this.unitService.findAll(query);
    return {
      message: 'All units have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<UnitResponseDto>>;
  }

  @Get(':slug')
  @RequireAuthority(AuthorityCode.UnitRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a unit by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: UnitResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'unit-abc123' })
  async findOne(@Param('slug') slug: string) {
    const result = await this.unitService.findOne(slug);
    return {
      message: 'Unit has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UnitResponseDto>;
  }

  @Patch(':slug')
  @RequireAuthority(AuthorityCode.UnitUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a unit' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Updated', type: UnitResponseDto })
  @ApiParam({ name: 'slug', required: true, example: 'unit-abc123' })
  async updateUnit(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateUnitRequestDto,
  ) {
    const result = await this.unitService.updateUnit(slug, requestData);
    return {
      message: 'Unit has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UnitResponseDto>;
  }

  @Delete(':slug')
  @RequireAuthority(AuthorityCode.UnitDelete)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a unit' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'unit-abc123' })
  async deleteUnit(@Param('slug') slug: string) {
    const result = await this.unitService.deleteUnit(slug);
    return {
      message: 'Unit has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} unit have been deleted successfully`,
    } as AppResponseDto<string>;
  }
}

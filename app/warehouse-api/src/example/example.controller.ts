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
  CreateExampleRequestDto,
  ExampleResponseDto,
  GetAllExampleRequestDto,
  UpdateExampleRequestDto,
} from './example.dto';
import { ExampleService } from './example.service';
import { Public } from 'src/auth/decorator/public.decorator';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('Example')
@Controller('examples')
@ApiBearerAuth()
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Post()
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new example' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: ExampleResponseDto,
  })
  async createExample(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateExampleRequestDto,
  ) {
    const result = await this.exampleService.createExample(requestData);
    return {
      message: 'Example has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExampleResponseDto>;
  }

  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all examples (paginated)' })
  @ApiPaginatedResponse(ExampleResponseDto, 'Retrieved')
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: GetAllExampleRequestDto,
  ) {
    const result = await this.exampleService.findAll(query);
    return {
      message: 'All examples have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<ExampleResponseDto>>;
  }

  @Get(':slug')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get an example by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: ExampleResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'example-abc123' })
  async findOne(@Param('slug') slug: string) {
    const result = await this.exampleService.findOne(slug);
    return {
      message: 'Example has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExampleResponseDto>;
  }

  @Patch(':slug')
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an example' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Updated', type: ExampleResponseDto })
  @ApiParam({ name: 'slug', required: true, example: 'example-abc123' })
  async updateExample(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateExampleRequestDto,
  ) {
    const result = await this.exampleService.updateExample(slug, requestData);
    return {
      message: 'Example has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExampleResponseDto>;
  }

  @Delete(':slug')
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an example' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'example-abc123' })
  async deleteExample(@Param('slug') slug: string) {
    const result = await this.exampleService.deleteExample(slug);
    return {
      message: 'Example has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} example have been deleted successfully`,
    } as AppResponseDto<string>;
  }
}

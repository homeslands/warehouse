import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AppResponseDto } from 'src/app/app.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { RoleService } from './role.service';
import { CreateRoleRequestDto, RoleResponseDto, UpdateRoleRequestDto } from './role.dto';

@ApiTags('Role')
@Controller('roles')
@ApiBearerAuth()
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all roles' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: RoleResponseDto,
    isArray: true,
  })
  async findAll() {
    const result = await this.roleService.findAll();
    return {
      message: 'All roles have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<RoleResponseDto[]>;
  }

  @Get(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a role by slug, with authority codes currently granted' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Retrieved', type: RoleResponseDto })
  @ApiParam({ name: 'slug', required: true, example: 'admin' })
  async findOne(@Param('slug') slug: string) {
    const result = await this.roleService.findOne(slug);
    return {
      message: 'Role has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<RoleResponseDto>;
  }

  @Post()
  @RequireAuthority(AuthorityCode.ManagePermissions)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a role' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: RoleResponseDto,
  })
  async create(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateRoleRequestDto,
  ) {
    const result = await this.roleService.create(requestData);
    return {
      message: 'Role has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<RoleResponseDto>;
  }

  @Patch(':slug')
  @RequireAuthority(AuthorityCode.ManagePermissions)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a role description' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Updated', type: RoleResponseDto })
  @ApiParam({ name: 'slug', required: true, example: 'admin' })
  async update(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateRoleRequestDto,
  ) {
    const result = await this.roleService.update(slug, requestData);
    return {
      message: 'Role has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<RoleResponseDto>;
  }
}

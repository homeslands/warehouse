import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AppResponseDto } from 'src/app/app.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityService } from './authority.service';
import {
  AuthorityResponseDto,
  GetAllAuthorityRequestDto,
  UpdateAuthorityRequestDto,
} from './authority.dto';

@ApiTags('Authority')
@Controller('authorities')
@ApiBearerAuth()
export class AuthorityController {
  constructor(private readonly authorityService: AuthorityService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all authorities (optionally filter by group)' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: AuthorityResponseDto,
    isArray: true,
  })
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllAuthorityRequestDto,
  ) {
    const result = await this.authorityService.findAll(query);
    return {
      message: 'All authorities have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AuthorityResponseDto[]>;
  }

  @Patch(':slug')
  @RequireAuthority('MANAGE_PERMISSIONS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update authority display name/group (code is immutable)' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Updated',
    type: AuthorityResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'example-create' })
  async update(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateAuthorityRequestDto,
  ) {
    const result = await this.authorityService.updateAuthority(slug, requestData);
    return {
      message: 'Authority has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AuthorityResponseDto>;
  }
}

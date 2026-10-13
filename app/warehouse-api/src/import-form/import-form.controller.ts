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
  ChangeImportFormStatusRequestDto,
  CreateImportFormRequestDto,
  GetAllImportFormRequestDto,
  ImportFormResponseDto,
  UpdateImportFormRequestDto,
} from './import-form.dto';
import { ImportFormService } from './import-form.service';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { WarehouseScope } from 'src/warehouse/decorator/warehouse-scope.decorator';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { CurrentUser, CurrentUserDto } from 'src/user/user.decorator';

/**
 * Phiếu nhập luôn thuộc 1 kho ⇒ lồng dưới `/warehouses/:warehouseSlug`. `@WarehouseScope` ở mức
 * class: mọi route chỉ cho manager/member của kho đó (`SUPER_ADMIN`/`ADMIN` bypass).
 *
 * `PATCH`/`DELETE` cố ý KHÔNG gắn `@RequireAuthority`: quyền là "bản đầy đủ HOẶC bản `_OWN`" mà
 * decorator chỉ biểu diễn được AND — service tự check (`ImportFormService.assertCanModify`).
 */
@ApiTags('Import Form')
@Controller('warehouses/:warehouseSlug/import-forms')
@ApiBearerAuth()
@ApiParam({ name: 'warehouseSlug', required: true, example: 'x7fk2p9qab' })
@WarehouseScope('warehouseSlug')
export class ImportFormController {
  constructor(private readonly importFormService: ImportFormService) {}

  @Post()
  @RequireAuthority(AuthorityCode.ImportFormCreate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a DRAFT import form in this warehouse' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: ImportFormResponseDto,
  })
  async createImportForm(
    @Param('warehouseSlug') warehouseSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateImportFormRequestDto,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.importFormService.createImportForm(
      warehouseSlug,
      requestData,
      currentUser,
    );
    return {
      message: 'Import form has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ImportFormResponseDto>;
  }

  @Get()
  @RequireAuthority(AuthorityCode.ImportFormRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get the import forms of this warehouse (paginated)' })
  @ApiPaginatedResponse(ImportFormResponseDto, 'Retrieved')
  async findAll(
    @Param('warehouseSlug') warehouseSlug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllImportFormRequestDto,
  ) {
    const result = await this.importFormService.findAll(warehouseSlug, query);
    return {
      message: 'Import forms have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<ImportFormResponseDto>>;
  }

  @Get(':slug')
  @RequireAuthority(AuthorityCode.ImportFormRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get an import form by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: ImportFormResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findOne(@Param('warehouseSlug') warehouseSlug: string, @Param('slug') slug: string) {
    const result = await this.importFormService.findOne(warehouseSlug, slug);
    return {
      message: 'Import form has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ImportFormResponseDto>;
  }

  @Patch(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a DRAFT import form',
    description: 'Requires IMPORT_FORM_UPDATE_DRAFT, or IMPORT_FORM_UPDATE_DRAFT_OWN for own forms',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Updated',
    type: ImportFormResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async updateImportForm(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateImportFormRequestDto,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.importFormService.updateImportForm(
      warehouseSlug,
      slug,
      requestData,
      currentUser,
    );
    return {
      message: 'Import form has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ImportFormResponseDto>;
  }

  @Post(':slug/confirm')
  @RequireAuthority(AuthorityCode.ImportFormConfirm)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a DRAFT import form (DRAFT -> CONFIRMED)' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Confirmed',
    type: ImportFormResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async confirmImportForm(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: ChangeImportFormStatusRequestDto,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.importFormService.confirmImportForm(
      warehouseSlug,
      slug,
      requestData,
      currentUser,
    );
    return {
      message: 'Import form has been confirmed successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ImportFormResponseDto>;
  }

  @Post(':slug/cancel')
  @RequireAuthority(AuthorityCode.ImportFormConfirm)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a DRAFT import form (DRAFT -> CANCELLED)' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Cancelled',
    type: ImportFormResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async cancelImportForm(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: ChangeImportFormStatusRequestDto,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.importFormService.cancelImportForm(
      warehouseSlug,
      slug,
      requestData,
      currentUser,
    );
    return {
      message: 'Import form has been cancelled successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ImportFormResponseDto>;
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a DRAFT import form',
    description: 'Requires IMPORT_FORM_DELETE_DRAFT, or IMPORT_FORM_DELETE_DRAFT_OWN for own forms',
  })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async deleteImportForm(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('slug') slug: string,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.importFormService.deleteImportForm(warehouseSlug, slug, currentUser);
    return {
      message: 'Import form has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} import form have been deleted successfully`,
    } as AppResponseDto<string>;
  }
}

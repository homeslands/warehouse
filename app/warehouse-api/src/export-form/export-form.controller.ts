import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { CustomFileInterceptor } from 'src/file/custom-interceptor';
import { EXPORT_FORM_UPLOAD_MAX_SIZE } from './export-form.constants';
import {
  ChangeExportFormStatusRequestDto,
  CreateExportFormRequestDto,
  GetAllExportFormRequestDto,
  ExportFormResponseDto,
  UpdateExportFormRequestDto,
} from './export-form.dto';
import { ExportFormService } from './export-form.service';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { WarehouseScope } from 'src/warehouse/decorator/warehouse-scope.decorator';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { CurrentUser, CurrentUserDto } from 'src/user/user.decorator';

/**
 * Phiếu xuất luôn thuộc 1 kho ⇒ lồng dưới `/warehouses/:warehouseSlug`. `@WarehouseScope` ở mức
 * class: mọi route chỉ cho manager/member của kho đó (`SUPER_ADMIN`/`ADMIN` bypass).
 *
 * `PATCH`/`DELETE`/`submit` cố ý KHÔNG gắn `@RequireAuthority`: quyền là "bản đầy đủ HOẶC bản `_OWN`" mà
 * decorator chỉ biểu diễn được AND — service tự check (`ExportFormService.assertCanModify`).
 */
@ApiTags('Export Form')
@Controller('warehouses/:warehouseSlug/export-forms')
@ApiBearerAuth()
@ApiParam({ name: 'warehouseSlug', required: true, example: 'x7fk2p9qab' })
@WarehouseScope('warehouseSlug')
export class ExportFormController {
  constructor(private readonly exportFormService: ExportFormService) {}

  @Post()
  @RequireAuthority(AuthorityCode.ExportFormCreate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a DRAFT export form in this warehouse' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: ExportFormResponseDto,
  })
  async createExportForm(
    @Param('warehouseSlug') warehouseSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateExportFormRequestDto,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.exportFormService.createExportForm(
      warehouseSlug,
      requestData,
      currentUser,
    );
    return {
      message: 'Export form has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExportFormResponseDto>;
  }

  // Không gắn `@RequireAuthority`: quyền là OR (tạo HOẶC sửa nháp/_OWN), service tự check.
  @Post('upload-file')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    new CustomFileInterceptor('file', {
      limits: { fileSize: EXPORT_FORM_UPLOAD_MAX_SIZE, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload an attachment for an export form to S3',
    description:
      'Returns the S3 link; send it as `file` in POST/PATCH export form. Max 10MB, ' +
      'pdf/jpg/png/webp/xls/xlsx/doc/docx. Requires EXPORT_FORM_CREATE, ' +
      'EXPORT_FORM_UPDATE_DRAFT or EXPORT_FORM_UPDATE_DRAFT_OWN',
  })
  @ApiResponseWithType({ status: HttpStatus.CREATED, description: 'Uploaded', type: String })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.exportFormService.uploadFile(file, currentUser);
    return {
      message: 'File has been uploaded successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<string>;
  }

  @Get()
  @RequireAuthority(AuthorityCode.ExportFormRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get the export forms of this warehouse (paginated, filter by status / type / code / ' +
      'invoiceCode / purchaseOrder (prefix) / requesterSlug / approverSlug / startDate-endDate ' +
      '(creation date); ' +
      'sortBy = createdAt | code, sort = ASC | DESC)',
  })
  @ApiPaginatedResponse(ExportFormResponseDto, 'Retrieved')
  async findAll(
    @Param('warehouseSlug') warehouseSlug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllExportFormRequestDto,
  ) {
    const result = await this.exportFormService.findAll(warehouseSlug, query);
    return {
      message: 'Export forms have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<ExportFormResponseDto>>;
  }

  @Get(':slug')
  @RequireAuthority(AuthorityCode.ExportFormRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get an export form by slug' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: ExportFormResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findOne(@Param('warehouseSlug') warehouseSlug: string, @Param('slug') slug: string) {
    const result = await this.exportFormService.findOne(warehouseSlug, slug);
    return {
      message: 'Export form has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExportFormResponseDto>;
  }

  @Patch(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a DRAFT export form',
    description: 'Requires EXPORT_FORM_UPDATE_DRAFT, or EXPORT_FORM_UPDATE_DRAFT_OWN for own forms',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Updated',
    type: ExportFormResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async updateExportForm(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateExportFormRequestDto,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.exportFormService.updateExportForm(
      warehouseSlug,
      slug,
      requestData,
      currentUser,
    );
    return {
      message: 'Export form has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExportFormResponseDto>;
  }

  @Post(':slug/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a DRAFT export form for confirmation (DRAFT -> PENDING)',
    description:
      'Reserves the quantity on the material batches (the chosen batch, or earliest expiry first ' +
      'when none is chosen — a line may be split per batch) and on the warehouse stock, in one ' +
      'transaction. Fails if remaining - reserved is not enough. A PENDING form can no longer be ' +
      'edited or deleted, only confirmed or cancelled. Requires EXPORT_FORM_UPDATE_DRAFT, or ' +
      'EXPORT_FORM_UPDATE_DRAFT_OWN for own forms',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Submitted',
    type: ExportFormResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async submitExportForm(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: ChangeExportFormStatusRequestDto,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.exportFormService.submitExportForm(
      warehouseSlug,
      slug,
      requestData,
      currentUser,
    );
    return {
      message: 'Export form has been submitted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExportFormResponseDto>;
  }

  @Post(':slug/confirm')
  @RequireAuthority(AuthorityCode.ExportFormConfirm)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a PENDING export form (PENDING -> CONFIRMED)',
    description:
      'Takes the reserved quantity out of the batches reserved at submit and out of the warehouse ' +
      'stock, in one transaction. A DISPOSAL form also requires EXPORT_FORM_APPROVE_DISPOSAL',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Confirmed',
    type: ExportFormResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async confirmExportForm(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: ChangeExportFormStatusRequestDto,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.exportFormService.confirmExportForm(
      warehouseSlug,
      slug,
      requestData,
      currentUser,
    );
    return {
      message: 'Export form has been confirmed successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExportFormResponseDto>;
  }

  @Post(':slug/cancel')
  @RequireAuthority(AuthorityCode.ExportFormConfirm)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a DRAFT or PENDING export form (-> CANCELLED)',
    description:
      'Cancelling a PENDING form gives its reserved quantity back to the batches and stock',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Cancelled',
    type: ExportFormResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async cancelExportForm(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: ChangeExportFormStatusRequestDto,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.exportFormService.cancelExportForm(
      warehouseSlug,
      slug,
      requestData,
      currentUser,
    );
    return {
      message: 'Export form has been cancelled successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExportFormResponseDto>;
  }

  @Delete(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a DRAFT export form',
    description: 'Requires EXPORT_FORM_DELETE_DRAFT, or EXPORT_FORM_DELETE_DRAFT_OWN for own forms',
  })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async deleteExportForm(
    @Param('warehouseSlug') warehouseSlug: string,
    @Param('slug') slug: string,
    @CurrentUser() currentUser: CurrentUserDto,
  ) {
    const result = await this.exportFormService.deleteExportForm(warehouseSlug, slug, currentUser);
    return {
      message: 'Export form has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} export form have been deleted successfully`,
    } as AppResponseDto<string>;
  }
}

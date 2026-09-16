import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import {
  HttpStatus,
  HttpCode,
  Post,
  Controller,
  ValidationPipe,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import {
  GetAllTaxProfileRequestDto,
  LookupTaxProfileParamDto,
  TaxProfileResponseDto,
} from './tax-profile.dto';
import { TaxProfileService } from './tax-profile.service';
import { HasRole } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('TaxProfile')
@Controller('tax-profiles')
@ApiBearerAuth()
export class TaxProfileController {
  constructor(private readonly taxProfileService: TaxProfileService) {}

  @Get()
  @HasRole(RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all cached tax profiles (paginated)' })
  @ApiPaginatedResponse(TaxProfileResponseDto, 'Retrieved')
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllTaxProfileRequestDto,
  ) {
    const result = await this.taxProfileService.findAll(query);
    return {
      message: 'All tax profiles have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<TaxProfileResponseDto>>;
  }

  @Get(':taxCode')
  @HasRole(RoleEnum.Admin, RoleEnum.Manager, RoleEnum.Supervisor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Look up a tax profile by tax code (cache-first, calls the provider on a miss)',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: TaxProfileResponseDto,
  })
  @ApiParam({ name: 'taxCode', required: true, example: '0101245486' })
  async lookup(
    @Param(new ValidationPipe({ transform: true, whitelist: true }))
    params: LookupTaxProfileParamDto,
  ) {
    const result = await this.taxProfileService.lookup(params.taxCode);
    return {
      message: 'Tax profile has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<TaxProfileResponseDto>;
  }

  // `POST` chứ không phải query param `?refresh=true` trên route GET: nó là đường DUY NHẤT gọi
  // thẳng ra bên thứ ba, nên phân quyền phải nằm trọn ở decorator (ADMIN) thay vì phải tự check
  // role trong service theo giá trị của 1 param.
  @Post(':taxCode/refresh')
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force a re-fetch from the tax lookup provider and overwrite the cache',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Refreshed',
    type: TaxProfileResponseDto,
  })
  @ApiParam({ name: 'taxCode', required: true, example: '0101245486' })
  async refresh(
    @Param(new ValidationPipe({ transform: true, whitelist: true }))
    params: LookupTaxProfileParamDto,
  ) {
    const result = await this.taxProfileService.refresh(params.taxCode);
    return {
      message: 'Tax profile has been refreshed successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<TaxProfileResponseDto>;
  }
}

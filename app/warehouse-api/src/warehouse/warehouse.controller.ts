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
  Put,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import {
  AssignWarehouseMemberRequestDto,
  AssignWarehouseManagerRequestDto,
  CreateWarehouseRequestDto,
  GetAllWarehouseRequestDto,
  GetAvailableWarehouseMemberRequestDto,
  UpdateWarehouseRequestDto,
  WarehouseMemberResponseDto,
  WarehouseResponseDto,
} from './warehouse.dto';
import { WarehouseService } from './warehouse.service';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';
import { CurrentUser, CurrentUserDto } from 'src/user/user.decorator';
import { UserResponseDto } from 'src/user/user.dto';
import { BaseQueryDto } from 'src/app/base.dto';

@ApiTags('Warehouse')
@Controller('warehouses')
@ApiBearerAuth()
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  @RequireAuthority(AuthorityCode.WarehouseCreate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new warehouse' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: WarehouseResponseDto,
  })
  async createWarehouse(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateWarehouseRequestDto,
  ) {
    const result = await this.warehouseService.createWarehouse(requestData);
    return {
      message: 'Warehouse has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseResponseDto>;
  }

  @Get()
  @RequireAuthority(AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all warehouses (paginated)',
    description:
      'ADMIN/SUPER_ADMIN see all warehouses. Every lower role only gets warehouses where they ' +
      'are the manager or a member (`managerSlug`/`hasManager` are ignored).',
  })
  @ApiPaginatedResponse(WarehouseResponseDto, 'Retrieved')
  async findAll(
    @CurrentUser() currentUser: CurrentUserDto,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAllWarehouseRequestDto,
  ) {
    const result = await this.warehouseService.findAll(query, currentUser);
    return {
      message: 'All warehouses have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<WarehouseResponseDto>>;
  }

  // PHẢI khai TRƯỚC `@Get(':slug')`, nếu không route `:slug` nuốt mất đường dẫn `mine`.
  // Không gắn `@RequireAuthority`: chỉ cần JWT hợp lệ, và service đã tự giới hạn theo `userId`.
  // @Get('mine')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Get warehouses managed by the current user (paginated)' })
  // @ApiPaginatedResponse(WarehouseResponseDto, 'Retrieved')
  // async findMine(
  //   @CurrentUser() user: CurrentUserDto,
  //   @Query(new ValidationPipe({ transform: true, whitelist: true }))
  //   query: GetMyWarehouseRequestDto,
  // ) {
  //   const result = await this.warehouseService.findMine(user.userId, query);
  //   return {
  //     message: 'Managed warehouses have been retrieved successfully',
  //     statusCode: HttpStatus.OK,
  //     timestamp: new Date().toISOString(),
  //     result,
  //   } as AppResponseDto<AppPaginatedResponseDto<WarehouseResponseDto>>;
  // }

  // Cùng phạm vi với `GET /warehouses`: dưới ADMIN chỉ đọc được kho mình là manager hoặc thành viên
  // — service tự check (xem `WarehouseService.findOne`).
  @Get(':slug')
  @RequireAuthority(AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a warehouse by slug',
    description:
      'ADMIN/SUPER_ADMIN can read any warehouse. Other roles can only read warehouses where they ' +
      'are the manager or a member; otherwise `WAREHOUSE_ACCESS_DENIED` (403) is returned.',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: WarehouseResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findOne(@CurrentUser() currentUser: CurrentUserDto, @Param('slug') slug: string) {
    const result = await this.warehouseService.findOne(slug, currentUser);
    return {
      message: 'Warehouse has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseResponseDto>;
  }

  @Patch(':slug')
  @RequireAuthority(AuthorityCode.WarehouseUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a warehouse' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Updated',
    type: WarehouseResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async updateWarehouse(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateWarehouseRequestDto,
  ) {
    const result = await this.warehouseService.updateWarehouse(slug, requestData);
    return {
      message: 'Warehouse has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseResponseDto>;
  }

  // `PUT` chứ không `PATCH`/`DELETE`: nó thay thế đúng 1 slot manager và idempotent, còn
  // `managerSlug: null` gỡ phân công ngay trong cùng code path.
  @Put(':slug/manager')
  @RequireAuthority(AuthorityCode.WarehouseAssignManager)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign (or unassign with null) the manager of a warehouse' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Assigned',
    type: WarehouseResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async assignManager(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: AssignWarehouseManagerRequestDto,
  ) {
    const result = await this.warehouseService.assignManager(slug, requestData);
    return {
      message: 'Warehouse manager has been assigned successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseResponseDto>;
  }

  // Nối 2 tài nguyên nên không đẻ authority mới: sửa kho (`WarehouseUpdate`) + tra user (`UserRead`).
  // `PUT` giống `PUT :slug/manager`: idempotent — gán lại user đã là thành viên trả 200 với row cũ,
  // không 409.
  @Put(':slug/members')
  @RequireAuthority(AuthorityCode.WarehouseUpdate, AuthorityCode.UserRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign a user as a member of a warehouse (idempotent)',
    description:
      'The user must be active and must not be ADMIN/SUPER_ADMIN ' +
      '(`WAREHOUSE_MEMBER_USER_IS_ADMIN`).',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Assigned',
    type: WarehouseMemberResponseDto,
  })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async assignMember(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: AssignWarehouseMemberRequestDto,
  ) {
    const result = await this.warehouseService.assignMember(slug, requestData);
    return {
      message: 'Warehouse member has been assigned successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<WarehouseMemberResponseDto>;
  }

  // Chỉ cần `WarehouseRead` (không `UserRead`): MANAGER/SUPERVISOR xem được thành viên kho mình,
  // service giới hạn phạm vi giống `GET :slug`.
  @Get(':slug/members')
  @RequireAuthority(AuthorityCode.WarehouseRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List members of a warehouse (paginated)',
    description:
      'Does not include the warehouse manager (see `GET /warehouses/{slug}`). ADMIN/SUPER_ADMIN ' +
      'can view any warehouse; other roles can only view warehouses where they are the manager ' +
      'or a member; otherwise `WAREHOUSE_ACCESS_DENIED` (403) is returned.',
  })
  @ApiPaginatedResponse(WarehouseMemberResponseDto, 'Retrieved')
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findMembers(
    @CurrentUser() currentUser: CurrentUserDto,
    @Param('slug') slug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: BaseQueryDto,
  ) {
    const result = await this.warehouseService.findMembers(slug, query, currentUser);
    return {
      message: 'Warehouse members have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<WarehouseMemberResponseDto>>;
  }

  // Cùng cặp quyền với `PUT :slug/members` — đây là danh sách để chọn user khi gán.
  @Get(':slug/available-members')
  @RequireAuthority(AuthorityCode.WarehouseUpdate, AuthorityCode.UserRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List users that can be assigned as members of a warehouse (paginated)',
    description:
      'Only users who are active, not yet members of the warehouse, not its current manager, ' +
      'and not ADMIN/SUPER_ADMIN.',
  })
  @ApiPaginatedResponse(UserResponseDto, 'Retrieved')
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async findAvailableMembers(
    @Param('slug') slug: string,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: GetAvailableWarehouseMemberRequestDto,
  ) {
    const result = await this.warehouseService.findAvailableMembers(slug, query);
    return {
      message: 'Available warehouse members have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<UserResponseDto>>;
  }

  @Delete(':slug/members/:userSlug')
  @RequireAuthority(AuthorityCode.WarehouseUpdate, AuthorityCode.UserRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a user from the members of a warehouse' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Removed', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  @ApiParam({ name: 'userSlug', required: true, example: 'u3kd8m2pqz' })
  async removeMember(@Param('slug') slug: string, @Param('userSlug') userSlug: string) {
    const result = await this.warehouseService.removeMember(slug, userSlug);
    return {
      message: 'Warehouse member has been removed successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} warehouse member have been removed successfully`,
    } as AppResponseDto<string>;
  }

  @Delete(':slug')
  @RequireAuthority(AuthorityCode.WarehouseDelete)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a warehouse' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'x7fk2p9qab' })
  async deleteWarehouse(@Param('slug') slug: string) {
    const result = await this.warehouseService.deleteWarehouse(slug);
    return {
      message: 'Warehouse has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} warehouse have been deleted successfully`,
    } as AppResponseDto<string>;
  }
}

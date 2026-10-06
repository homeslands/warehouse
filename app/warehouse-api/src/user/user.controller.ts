import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import {
  HttpStatus,
  HttpCode,
  Post,
  Body,
  Controller,
  ValidationPipe,
  Get,
  Param,
  Query,
  Patch,
  Delete,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ChangeUserPasswordRequestDto,
  ChangeUserPasswordResponseDto,
  ChangeUserRoleRequestDto,
  CreateUserRequestDto,
  GetAllUserRequestDto,
  UpdateUserRequestDto,
  UserResponseDto,
} from './user.dto';
import { UserService } from './user.service';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { CurrentUser, CurrentUserDto } from './user.decorator';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('User')
@Controller('users')
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @RequireAuthority(AuthorityCode.UserCreate)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a new user (assign a role lower than the caller's)" })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: UserResponseDto,
  })
  async createUser(
    @CurrentUser() currentUser: CurrentUserDto,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateUserRequestDto,
  ) {
    const result = await this.userService.createUser(requestData, currentUser);
    return {
      message: 'User has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }

  @Get()
  @RequireAuthority(AuthorityCode.UserRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all users (paginated, filter by role)' })
  @ApiPaginatedResponse(UserResponseDto, 'Retrieved')
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: GetAllUserRequestDto,
  ) {
    const result = await this.userService.findAll(query);
    return {
      message: 'All users have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<UserResponseDto>>;
  }

  @Post(':userSlug/change-password')
  @RequireAuthority(AuthorityCode.UserChangePassword)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change the password of another user (requires USER_CHANGE_PASSWORD)',
    description:
      'Đổi mật khẩu HỘ user khác — cần authority `USER_CHANGE_PASSWORD` (`SUPER_ADMIN` bypass), ' +
      'KHÔNG cần `currentPassword`. Riêng tài khoản `SUPER_ADMIN` thì ' +
      'chỉ `SUPER_ADMIN` khác mới đổi được, và không được trỏ `userSlug` vào chính mình — tự đổi ' +
      'mật khẩu của mình thì gọi `POST /auth/change-password`.\n\n' +
      'Đổi xong, MỌI phiên của user bị đổi bị thu hồi ngay ở request kế tiếp và họ phải đăng nhập ' +
      'lại; token của người gọi không bị đụng tới.',
  })
  @ApiParam({ name: 'userSlug', required: true, example: 'x7fk2p9q' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Password has been changed successfully',
    type: ChangeUserPasswordResponseDto,
  })
  async changeUserPassword(
    @CurrentUser() currentUser: CurrentUserDto,
    @Param('userSlug') userSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: ChangeUserPasswordRequestDto,
  ) {
    const result = await this.userService.changeUserPassword(currentUser, userSlug, requestData);
    return {
      message: 'Password has been changed successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ChangeUserPasswordResponseDto>;
  }

  @Patch(':userSlug')
  @RequireAuthority(AuthorityCode.UserUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update user profile (partial)',
    description:
      'Chỉ field gửi lên mới bị đổi. Không đổi được mật khẩu/role ở đây (dùng `.../change-password`, ' +
      '`.../change-role`). Sửa user khác thì role của họ phải thấp hơn role của người gọi; ADMIN ' +
      'không sửa được ADMIN khác (`ADMIN_CANNOT_MANAGE_ADMIN`).',
  })
  @ApiParam({ name: 'userSlug', required: true, example: 'x7fk2p9q' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Updated', type: UserResponseDto })
  async updateUser(
    @CurrentUser() currentUser: CurrentUserDto,
    @Param('userSlug') userSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: UpdateUserRequestDto,
  ) {
    const result = await this.userService.updateUser(currentUser, userSlug, requestData);
    return {
      message: 'User has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }

  @Put(':userSlug/lock')
  @RequireAuthority(AuthorityCode.UserUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lock a user account',
    description:
      'Đặt `isActive = false` và thu hồi mọi phiên của user (idempotent). Không khoá được chính ' +
      'mình, user có role ngang/cao hơn mình (ADMIN không khoá được ADMIN khác — ' +
      '`ADMIN_CANNOT_MANAGE_ADMIN`), hoặc user đang là manager của một kho (đổi manager kho trước).',
  })
  @ApiParam({ name: 'userSlug', required: true, example: 'x7fk2p9q' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Locked', type: UserResponseDto })
  async lockUser(@CurrentUser() currentUser: CurrentUserDto, @Param('userSlug') userSlug: string) {
    const result = await this.userService.lockUser(currentUser, userSlug);
    return {
      message: 'User has been locked successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }

  @Put(':userSlug/unlock')
  @RequireAuthority(AuthorityCode.UserUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unlock a user account',
    description:
      'Đặt `isActive = true` (idempotent) — user phải đăng nhập lại. Cùng rào cấp role với khoá ' +
      '(`ADMIN_CANNOT_MANAGE_ADMIN`).',
  })
  @ApiParam({ name: 'userSlug', required: true, example: 'x7fk2p9q' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Unlocked', type: UserResponseDto })
  async unlockUser(
    @CurrentUser() currentUser: CurrentUserDto,
    @Param('userSlug') userSlug: string,
  ) {
    const result = await this.userService.unlockUser(currentUser, userSlug);
    return {
      message: 'User has been unlocked successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }

  @Delete(':userSlug')
  @RequireAuthority(AuthorityCode.UserDelete)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a user',
    description:
      'Xoá mềm user cùng mọi tư cách thành viên kho của họ, thu hồi mọi phiên. Rào giống khoá: ' +
      'không xoá được chính mình, user có role ngang/cao hơn mình, hoặc manager của một kho. ' +
      'Số điện thoại vẫn bị giữ (`USER_PHONENUMBER_RESERVED_BY_DELETED_USER`).',
  })
  @ApiParam({ name: 'userSlug', required: true, example: 'x7fk2p9q' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  async deleteUser(
    @CurrentUser() currentUser: CurrentUserDto,
    @Param('userSlug') userSlug: string,
  ) {
    const result = await this.userService.deleteUser(currentUser, userSlug);
    return {
      message: 'User has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} user have been deleted successfully`,
    } as AppResponseDto<string>;
  }

  @Post(':userSlug/change-role')
  @RequireAuthority(AuthorityCode.UserUpdate)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change the role of another user',
    description:
      'Cả role hiện tại lẫn role mới của user phải thấp hơn role của người gọi; không đổi được role ' +
      'của chính mình. Đổi xong, mọi phiên của user bị thu hồi để token mang role cũ hết hiệu lực.',
  })
  @ApiParam({ name: 'userSlug', required: true, example: 'x7fk2p9q' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Role changed',
    type: UserResponseDto,
  })
  async changeUserRole(
    @CurrentUser() currentUser: CurrentUserDto,
    @Param('userSlug') userSlug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: ChangeUserRoleRequestDto,
  ) {
    const result = await this.userService.changeUserRole(currentUser, userSlug, requestData);
    return {
      message: 'User role has been changed successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }
}

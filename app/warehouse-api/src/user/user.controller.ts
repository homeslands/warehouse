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
  @ApiOperation({
    summary: 'Get all users (paginated, filter by role / isActive)',
    description:
      'Each user includes `role` (slug/name/description/level) and `warehouses` — the warehouses ' +
      'the user is a member of (excluding warehouses the user manages).\n\n' +
      '`ADMIN`/`SUPER_ADMIN` see everyone. Other roles (including `MANAGER`) only see users who ' +
      'are a manager/member of (at least 1) warehouse the caller is a manager/member of.',
  })
  @ApiPaginatedResponse(UserResponseDto, 'Retrieved')
  async findAll(
    @CurrentUser() currentUser: CurrentUserDto,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: GetAllUserRequestDto,
  ) {
    const result = await this.userService.findAll(query, {}, currentUser);
    return {
      message: 'All users have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<UserResponseDto>>;
  }

  @Get(':userSlug')
  @RequireAuthority(AuthorityCode.UserRead)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a user by slug',
    description:
      'Includes `role` and `warehouses` (warehouses the user is a member of). Same scope as ' +
      '`GET /users`: `ADMIN`/`SUPER_ADMIN` can view any user; other roles can only view ' +
      'themselves or users sharing a warehouse with them; out-of-scope users return ' +
      '`USER_NOT_FOUND`.',
  })
  @ApiParam({ name: 'userSlug', required: true, example: 'x7fk2p9q' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Retrieved', type: UserResponseDto })
  async findOne(@CurrentUser() currentUser: CurrentUserDto, @Param('userSlug') userSlug: string) {
    const result = await this.userService.findOne(currentUser, userSlug);
    return {
      message: 'User has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }

  @Post(':userSlug/change-password')
  @RequireAuthority(AuthorityCode.UserChangePassword)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change the password of another user (requires USER_CHANGE_PASSWORD)',
    description:
      'Changes the password ON BEHALF OF another user. The target role must not be higher than ' +
      "the caller's (same level is allowed), and only `SUPER_ADMIN` can change a `SUPER_ADMIN`'s " +
      'password (`CHANGE_PASSWORD_FORBIDDEN`). Targeting yourself is rejected ' +
      '(`CHANGE_OWN_PASSWORD_NOT_ALLOWED`) — call `POST /auth/change-password` instead.\n\n' +
      'Afterwards, ALL sessions of the affected user are revoked immediately and they must log in ' +
      'again.',
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
      'Only the fields sent are changed. Password/role cannot be changed here (use ' +
      '`.../change-password`, `.../change-role`). When editing another user, their role must be ' +
      "lower than the caller's role; an ADMIN cannot edit another ADMIN " +
      '(`ADMIN_CANNOT_MANAGE_ADMIN`).',
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
      "Sets `isActive = false` and revokes all of the user's sessions (idempotent). Cannot lock " +
      'yourself, a user with an equal/higher role (an ADMIN cannot lock another ADMIN — ' +
      '`ADMIN_CANNOT_MANAGE_ADMIN`), or a user who is currently the manager of a warehouse ' +
      "(change the warehouse's manager first).",
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
      'Sets `isActive = true` (idempotent) — the user must log in again. Same role-level ' +
      'restrictions as locking (`ADMIN_CANNOT_MANAGE_ADMIN`).',
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
      'Soft-deletes the user along with all of their warehouse memberships and revokes all ' +
      'sessions. Same restrictions as locking: cannot delete yourself, a user with an ' +
      'equal/higher role, or the manager of a warehouse. The phone number remains reserved ' +
      '(`USER_PHONENUMBER_RESERVED_BY_DELETED_USER`).',
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
      "Both the user's current role and the new role must be lower than the caller's role; you " +
      "cannot change your own role. Afterwards, all of the user's sessions are revoked so that " +
      'tokens carrying the old role are no longer valid.',
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

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
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ChangeUserPasswordRequestDto,
  ChangeUserPasswordResponseDto,
  CreateUserRequestDto,
  GetAllUserRequestDto,
  UserResponseDto,
} from './user.dto';
import { UserService } from './user.service';
import { HasRole } from 'src/role/role.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { CurrentUser, CurrentUserDto } from './user.decorator';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('User')
@Controller('users')
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HasRole(RoleEnum.Admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user (assign role)' })
  @ApiResponseWithType({
    status: HttpStatus.CREATED,
    description: 'Created',
    type: UserResponseDto,
  })
  async createUser(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: CreateUserRequestDto,
  ) {
    const result = await this.userService.createUser(requestData);
    return {
      message: 'User has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<UserResponseDto>;
  }

  @Get()
  @HasRole(RoleEnum.Admin)
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
  @HasRole(RoleEnum.Admin, RoleEnum.Manager)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change the password of another user (ADMIN/MANAGER only)',
    description:
      'Đổi mật khẩu HỘ user khác — chỉ `ADMIN`/`MANAGER` (`SUPER_ADMIN` bypass), ' +
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
}

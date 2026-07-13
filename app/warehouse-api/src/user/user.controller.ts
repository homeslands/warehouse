import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  HttpStatus,
  HttpCode,
  Post,
  Body,
  Controller,
  ValidationPipe,
  Get,
  Query,
} from '@nestjs/common';
import { CreateUserRequestDto, GetAllUserRequestDto, UserResponseDto } from './user.dto';
import { UserService } from './user.service';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('User')
@Controller('users')
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @RequireAuthority('USER_CREATE')
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
  @RequireAuthority('USER_READ')
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
}

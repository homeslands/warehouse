import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppResponseDto } from 'src/app/app.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { CurrentUser, CurrentUserDto } from 'src/user/user.decorator';
import { Public } from './decorator/public.decorator';
import { AuthService } from './auth.service';
import {
  LoginAuthRequestDto,
  LoginAuthResponseDto,
  LogoutAuthResponseDto,
  RefreshAuthRequestDto,
  SessionResponseDto,
} from './auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current logged-in user' })
  getProfile(@CurrentUser() currentUser: CurrentUserDto) {
    return {
      message: 'Current user has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: currentUser,
    } as AppResponseDto<CurrentUserDto>;
  }

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login by phone number + password' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Login successful',
    type: LoginAuthResponseDto,
  })
  async login(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: LoginAuthRequestDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const result = await this.authService.login(requestData, { ipAddress, userAgent });
    return {
      message: 'Login successful',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<LoginAuthResponseDto>;
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token by refresh token',
    description:
      'Refresh token xoay vòng mỗi lần gọi. Token cũ chỉ còn dùng được trong cửa sổ grace ngắn ' +
      '(cho refresh song song); dùng lại sau đó bị coi là token bị đánh cắp và cả phiên bị thu hồi.',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Token has been refreshed successfully',
    type: LoginAuthResponseDto,
  })
  async refresh(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: RefreshAuthRequestDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const result = await this.authService.refresh(requestData, { ipAddress, userAgent });
    return {
      message: 'Token has been refreshed successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<LoginAuthResponseDto>;
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout the current device',
    description:
      'Thu hồi refresh token của phiên hiện tại. Access token đã phát vẫn dùng được tới khi hết ' +
      'hạn (tối đa DURATION giây) vì access token là stateless.',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Logged out successfully',
    type: LogoutAuthResponseDto,
  })
  async logout(@CurrentUser() currentUser: CurrentUserDto) {
    const result = await this.authService.logout(currentUser.userId, currentUser.sessionId);
    return {
      message: 'Logged out successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<LogoutAuthResponseDto>;
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout every device of the current user',
    description:
      'Thu hồi toàn bộ refresh token của user — dùng khi nghi ngờ token bị đánh cắp. Access token ' +
      'đã phát vẫn dùng được tới khi hết hạn (tối đa DURATION giây).',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'All sessions have been revoked',
    type: LogoutAuthResponseDto,
  })
  async logoutAll(@CurrentUser() currentUser: CurrentUserDto) {
    const result = await this.authService.logoutAll(currentUser.userId);
    return {
      message: 'All sessions have been revoked successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<LogoutAuthResponseDto>;
  }

  @Get('sessions')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List the active login sessions of the current user' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Sessions have been retrieved successfully',
    type: SessionResponseDto,
    isArray: true,
  })
  async listSessions(@CurrentUser() currentUser: CurrentUserDto) {
    const result = await this.authService.listSessions(currentUser.userId, currentUser.sessionId);
    return {
      message: 'Sessions have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<SessionResponseDto[]>;
  }
}

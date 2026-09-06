import { Body, Controller, Get, HttpCode, HttpStatus, Post, ValidationPipe } from '@nestjs/common';
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
  ) {
    const result = await this.authService.login(requestData);
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
      'Phát lại CẢ access lẫn refresh token với hạn mới, giữ nguyên phiên. Không xoay vòng: ' +
      'refresh token cũ vẫn dùng được tới khi tự hết hạn, không có phát hiện token bị đánh cắp. ' +
      'Muốn vô hiệu hoá ngay thì gọi /auth/logout hoặc /auth/logout-all.',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Token has been refreshed successfully',
    type: LoginAuthResponseDto,
  })
  async refresh(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: RefreshAuthRequestDto,
  ) {
    const result = await this.authService.refresh(requestData);
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
      'Thu hồi phiên hiện tại. Có hiệu lực NGAY ở request kế tiếp với cả access lẫn refresh ' +
      'token, vì cả 2 mang cùng sid và sid đó bị đưa vào deny-list trên Redis.',
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
      'Thu hồi mọi token của user đã phát hành trước thời điểm gọi, trên mọi thiết bị — dùng khi ' +
      'nghi ngờ token bị đánh cắp. Có hiệu lực ngay ở request kế tiếp. Đăng nhập lại sau đó vẫn ' +
      'bình thường.',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'All sessions have been revoked',
    type: LogoutAuthResponseDto,
  })
  async logoutAll(@CurrentUser() currentUser: CurrentUserDto) {
    const result = await this.authService.logoutAll(currentUser.userId, currentUser.sessionId);
    return {
      message: 'All sessions have been revoked successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<LogoutAuthResponseDto>;
  }
}

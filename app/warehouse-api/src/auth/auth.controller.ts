import { Body, Controller, Get, HttpCode, HttpStatus, Post, ValidationPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppResponseDto } from 'src/app/app.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { CurrentUser, CurrentUserDto } from 'src/user/user.decorator';
import { Public } from './decorator/public.decorator';
import { AuthService } from './auth.service';
import {
  ChangePasswordRequestDto,
  ChangePasswordResponseDto,
  LoginAuthRequestDto,
  LoginAuthResponseDto,
  LogoutAuthResponseDto,
  ProfileResponseDto,
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
  async getProfile(@CurrentUser() currentUser: CurrentUserDto) {
    const result = await this.authService.getProfile(currentUser);

    return {
      message: 'Current user has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ProfileResponseDto>;
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
      'Reissues BOTH the access and refresh tokens with new expiry times, keeping the same ' +
      'session. No rotation: the old refresh token remains usable until it expires on its own, ' +
      'and there is no stolen-token detection. To invalidate immediately, call /auth/logout or ' +
      '/auth/logout-all.',
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
      'Revokes the current session. Takes effect IMMEDIATELY on the next request for both the ' +
      'access and refresh tokens, since both carry the same sid and that sid is added to the ' +
      'deny-list in Redis.',
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
      "Revokes all of the user's tokens issued before the time of the call, on every device — " +
      'use when a token is suspected to be stolen. Takes effect immediately on the next request. ' +
      'Logging in again afterwards works normally.',
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

  @Post('change-password')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change the password of your own account',
    description:
      'Only changes the password of the currently logged-in account ITSELF; any logged-in user ' +
      'can call it but MUST include `currentPassword`. To change it on behalf of someone else, ' +
      'call `POST /users/{userSlug}/change-password`.\n\n' +
      'Afterwards, ALL of your own sessions are revoked starting from the next request; ' +
      '`result.tokens` is a new token pair (new `sid`) so you do not have to log in again.',
  })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Password has been changed successfully',
    type: ChangePasswordResponseDto,
  })
  async changePassword(
    @CurrentUser() currentUser: CurrentUserDto,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    requestData: ChangePasswordRequestDto,
  ) {
    const result = await this.authService.changeOwnPassword(currentUser, requestData);
    return {
      message: 'Password has been changed successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ChangePasswordResponseDto>;
  }
}

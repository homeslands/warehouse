import { Body, Controller, Get, HttpCode, HttpStatus, Post, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppResponseDto } from 'src/app/app.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { CurrentUser, CurrentUserDto } from 'src/user/user.decorator';
import { Public } from './decorator/public.decorator';
import { AuthService } from './auth.service';
import { LoginAuthRequestDto, LoginAuthResponseDto, RefreshAuthRequestDto } from './auth.dto';

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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token by refresh token' })
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
}

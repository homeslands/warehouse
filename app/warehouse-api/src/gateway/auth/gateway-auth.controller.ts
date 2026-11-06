import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CSRF_HEADER } from '../gateway.constants';
import { GatewayContext, GatewayRequestContext } from '../gateway-request';
import { V1_VALIDATION_OPTIONS, V1UuidPipe } from '../v1-validation';
import { CookieSink, GatewayAuthService } from './gateway-auth.service';
import { V1ListOwnSessionsQueryDto, V1LoginDto, V1PasswordChangeDto } from './gateway-auth.dto';

const cookieSink =
  (response: Response): CookieSink =>
  (cookies) =>
    response.append('Set-Cookie', cookies);

/**
 * HTTP v1 cho 9 operation phiên (OpenAPI R2 #1-6, #9-11; W02 I-02b). Mọi route trả 200 + envelope v1.
 * `getProfile`/`updateProfile` (#7-8) chưa có: cần mapping `User` v1 của I-03 (route không tồn tại ⇒ 404 v1).
 *
 * Quyền (BE-AUTH-01): Gateway v1 KHÔNG dùng guard legacy (`@Public`/`@RequireAuthority`). `x-authority`:
 * - `login`, `refresh`: PUBLIC_AUTH — không cần JWT; refresh cần cookie + Origin + CSRF;
 * - còn lại: AUTHENTICATED — `GatewayAuthService` kiểm JWT, Storage kiểm lại JWT + phiên. Không có mã quyền
 *   nào khác (op tự phục vụ của chính phiên/user), nên không có nhánh 403 theo authority.
 */
@ApiTags('v1 auth / sessions')
@Controller()
export class GatewayAuthController {
  constructor(private readonly auth: GatewayAuthService) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'login' })
  login(
    @Body(new ValidationPipe(V1_VALIDATION_OPTIONS)) dto: V1LoginDto,
    @GatewayContext() context: GatewayRequestContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(dto, context, cookieSink(response));
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('RefreshCookie')
  @ApiOperation({ operationId: 'refresh' })
  refresh(
    @Headers('origin') origin: string | undefined,
    @Headers(CSRF_HEADER) csrfToken: string | undefined,
    @Headers('cookie') cookie: string | undefined,
    @GatewayContext() context: GatewayRequestContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.refresh({ origin, csrfToken, cookie }, context, cookieSink(response));
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'logout' })
  logout(
    @Headers('authorization') authorization: string | undefined,
    @GatewayContext() context: GatewayRequestContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.logout(authorization, context, cookieSink(response));
  }

  @Post('auth/logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'logoutall' })
  logoutAll(
    @Headers('authorization') authorization: string | undefined,
    @GatewayContext() context: GatewayRequestContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.logoutAll(authorization, context, cookieSink(response));
  }

  @Post('auth/lock')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'lock' })
  lock(
    @Headers('authorization') authorization: string | undefined,
    @GatewayContext() context: GatewayRequestContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.lock(authorization, context, cookieSink(response));
  }

  @Post('auth/change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'changeOwnPassword' })
  changeOwnPassword(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ValidationPipe(V1_VALIDATION_OPTIONS)) dto: V1PasswordChangeDto,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.auth.changeOwnPassword(authorization, dto, context);
  }

  @Post('auth/activity')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'recordInteractiveActivity' })
  recordActivity(
    @Headers('authorization') authorization: string | undefined,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.auth.recordActivity(authorization, context);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'listOwnSessions' })
  listOwnSessions(
    @Headers('authorization') authorization: string | undefined,
    @Query(new ValidationPipe(V1_VALIDATION_OPTIONS)) query: V1ListOwnSessionsQueryDto,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.auth.listOwnSessions(authorization, query, context);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'revokeOwnSession' })
  revokeOwnSession(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', V1UuidPipe) id: string,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.auth.revokeOwnSession(authorization, id, context);
  }
}

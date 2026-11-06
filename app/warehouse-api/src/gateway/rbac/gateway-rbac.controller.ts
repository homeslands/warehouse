import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  Patch,
  PipeTransform,
  Put,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RbacFieldErrorKey } from 'src/rbac-v1/rbac-v1.validation';
import { V1ListOwnSessionsQueryDto } from '../auth/gateway-auth.dto';
import { GatewayException } from '../gateway.exception';
import { GatewayContext, GatewayRequestContext } from '../gateway-request';
import { GatewayValidation } from '../gateway.validation';
import { V1_VALIDATION_OPTIONS, V1UuidPipe } from '../v1-validation';
import { V1AuthorityPatchDto, V1RolePatchDto, V1VersionQueryDto } from './gateway-rbac.dto';
import { GatewayRbacService } from './gateway-rbac.service';

const AUTHORITY_CODE = /^[A-Z][A-Z0-9_]{1,79}$/;

/** Path `{authorityCode}` theo pattern OpenAPI `Authority.code` ⇒ 422 nếu sai, trước khi gọi Storage. */
@Injectable()
export class V1AuthorityCodePipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !AUTHORITY_CODE.test(value))
      throw new GatewayException(GatewayValidation.GATEWAY_REQUEST_INVALID, [
        {
          field: 'authorityCode',
          errorKey: RbacFieldErrorKey.AUTHORITY_CODE_INVALID,
          message: 'authorityCode is invalid',
        },
      ]);
    return value;
  }
}

/**
 * HTTP v1 role/authority/permission — OpenAPI #19, #21-28 (W02 I-03a). `createRole` (#20, Idempotency-Key) ở
 * I-03b. Quyền (BE-AUTH-01): Gateway không gác authority; Storage kiểm `x-authority` + family ceiling +
 * level cho MỌI RPC (route thiếu annotation ở Storage ⇒ deny: `RBAC_RPC_AUTHORITY`).
 */
@ApiTags('v1 roles / authorities')
@ApiBearerAuth()
@Controller()
export class GatewayRbacController {
  constructor(private readonly rbac: GatewayRbacService) {}

  @Get('roles')
  @ApiOperation({ operationId: 'listRoles' })
  listRoles(
    @Headers('authorization') auth: string | undefined,
    @Query(new ValidationPipe(V1_VALIDATION_OPTIONS)) query: V1ListOwnSessionsQueryDto,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.rbac.listRoles(auth, query, context);
  }

  @Get('roles/:id')
  @ApiOperation({ operationId: 'getRole' })
  getRole(
    @Headers('authorization') auth: string | undefined,
    @Param('id', V1UuidPipe) id: string,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.rbac.getRole(auth, id, context);
  }

  @Patch('roles/:id')
  @ApiOperation({ operationId: 'updateRole' })
  updateRole(
    @Headers('authorization') auth: string | undefined,
    @Param('id', V1UuidPipe) id: string,
    @Body(new ValidationPipe(V1_VALIDATION_OPTIONS)) dto: V1RolePatchDto,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.rbac.updateRole(auth, id, dto, context);
  }

  @Delete('roles/:id')
  @ApiOperation({ operationId: 'deleteRole' })
  deleteRole(
    @Headers('authorization') auth: string | undefined,
    @Param('id', V1UuidPipe) id: string,
    @Query(new ValidationPipe(V1_VALIDATION_OPTIONS)) query: V1VersionQueryDto,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.rbac.deleteRole(auth, id, query.version, context);
  }

  @Get('authorities')
  @ApiOperation({ operationId: 'listAuthorities' })
  listAuthorities(
    @Headers('authorization') auth: string | undefined,
    @Query(new ValidationPipe(V1_VALIDATION_OPTIONS)) query: V1ListOwnSessionsQueryDto,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.rbac.listAuthorities(auth, query, context);
  }

  @Get('authority-groups')
  @ApiOperation({ operationId: 'listAuthorityGroups' })
  listAuthorityGroups(
    @Headers('authorization') auth: string | undefined,
    @Query(new ValidationPipe(V1_VALIDATION_OPTIONS)) query: V1ListOwnSessionsQueryDto,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.rbac.listAuthorityGroups(auth, query, context);
  }

  @Patch('authorities/:id')
  @ApiOperation({ operationId: 'updateAuthorityMetadata' })
  updateAuthorityMetadata(
    @Headers('authorization') auth: string | undefined,
    @Param('id', V1UuidPipe) id: string,
    @Body(new ValidationPipe(V1_VALIDATION_OPTIONS)) dto: V1AuthorityPatchDto,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.rbac.updateAuthorityMetadata(auth, id, dto, context);
  }

  @Put('roles/:id/authorities/:authorityCode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'putRoleAuthority' })
  putRoleAuthority(
    @Headers('authorization') auth: string | undefined,
    @Param('id', V1UuidPipe) id: string,
    @Param('authorityCode', V1AuthorityCodePipe) code: string,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.rbac.putRoleAuthority(auth, id, code, context);
  }

  @Delete('roles/:id/authorities/:authorityCode')
  @ApiOperation({ operationId: 'deleteRoleAuthority' })
  deleteRoleAuthority(
    @Headers('authorization') auth: string | undefined,
    @Param('id', V1UuidPipe) id: string,
    @Param('authorityCode', V1AuthorityCodePipe) code: string,
    @Query(new ValidationPipe(V1_VALIDATION_OPTIONS)) query: V1VersionQueryDto,
    @GatewayContext() context: GatewayRequestContext,
  ) {
    return this.rbac.deleteRoleAuthority(auth, id, code, query.version, context);
  }
}

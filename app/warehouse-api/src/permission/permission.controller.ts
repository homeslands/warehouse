import { Controller, Delete, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AppResponseDto } from 'src/app/app.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { AuthorityCode } from 'src/authority/authority.constants';
import { RequireAuthority } from 'src/authority/authority.decorator';
import { CurrentUser, CurrentUserDto } from 'src/user/user.decorator';
import { PermissionService } from './permission.service';

@ApiTags('Permission')
@Controller('roles/:roleSlug/authorities')
@ApiBearerAuth()
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Put(':authorityCode')
  @RequireAuthority(AuthorityCode.ManagePermissions)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Grant an authority to a lower-level role (idempotent); caller must own the authority',
  })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Granted', type: String })
  @ApiParam({ name: 'roleSlug', required: true, example: 'admin' })
  @ApiParam({ name: 'authorityCode', required: true, example: 'EXAMPLE_CREATE' })
  async grant(
    @CurrentUser() currentUser: CurrentUserDto,
    @Param('roleSlug') roleSlug: string,
    @Param('authorityCode') authorityCode: string,
  ) {
    await this.permissionService.grant(currentUser, roleSlug, authorityCode);
    return {
      message: 'Authority has been granted to role successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: 'OK',
    } as AppResponseDto<string>;
  }

  @Delete(':authorityCode')
  @RequireAuthority(AuthorityCode.ManagePermissions)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke an authority from a lower-level role and every role below it (idempotent)',
  })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Revoked', type: String })
  @ApiParam({ name: 'roleSlug', required: true, example: 'admin' })
  @ApiParam({ name: 'authorityCode', required: true, example: 'EXAMPLE_CREATE' })
  async revoke(
    @CurrentUser() currentUser: CurrentUserDto,
    @Param('roleSlug') roleSlug: string,
    @Param('authorityCode') authorityCode: string,
  ) {
    await this.permissionService.revoke(currentUser, roleSlug, authorityCode);
    return {
      message: 'Authority has been revoked from role successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: 'OK',
    } as AppResponseDto<string>;
  }
}

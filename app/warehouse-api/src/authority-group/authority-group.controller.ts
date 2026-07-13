import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppResponseDto } from 'src/app/app.dto';
import { ApiResponseWithType } from 'src/app/app.decorator';
import { AuthorityGroupService } from './authority-group.service';
import { AuthorityGroupResponseDto } from './authority-group.dto';

@ApiTags('Authority Group')
@Controller('authority-groups')
@ApiBearerAuth()
export class AuthorityGroupController {
  constructor(private readonly authorityGroupService: AuthorityGroupService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all authority groups' })
  @ApiResponseWithType({
    status: HttpStatus.OK,
    description: 'Retrieved',
    type: AuthorityGroupResponseDto,
    isArray: true,
  })
  async findAll() {
    const result = await this.authorityGroupService.findAll();
    return {
      message: 'All authority groups have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AuthorityGroupResponseDto[]>;
  }
}

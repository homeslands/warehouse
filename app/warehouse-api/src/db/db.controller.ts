import { Controller, Post, HttpStatus } from '@nestjs/common';
import { DbService } from './db.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppResponseDto } from 'src/app/app.dto';
import { RoleEnum } from 'src/role/role.enum';
import { HasRoles } from 'src/role/roles.decorator';

@Controller('db')
@ApiTags('Database')
@ApiBearerAuth()
export class DbController {
  constructor(private readonly dbService: DbService) {}

  @Post()
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  async backup(): Promise<AppResponseDto<string>> {
    const result = await this.dbService.backup();
    return {
      message: `Database backup created at ${result}`,
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<string>;
  }
}

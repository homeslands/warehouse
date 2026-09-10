import { Controller, Post, HttpStatus } from '@nestjs/common';
import { DbService } from './db.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppResponseDto } from 'src/app/app.dto';
import { AuthorityCode } from 'src/authority/authority.constants';
import { RequireAuthority } from 'src/authority/authority.decorator';

@Controller('db')
@ApiTags('Database')
@ApiBearerAuth()
export class DbController {
  constructor(private readonly dbService: DbService) {}

  @Post()
  @RequireAuthority(AuthorityCode.DbBackup)
  async backup(): Promise<AppResponseDto<string>> {
    const result = await this.dbService.backup();
    return {
      message: `Database backup created at ${result}`,
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
    } as AppResponseDto<string>;
  }
}

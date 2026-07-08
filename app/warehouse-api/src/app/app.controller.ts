import { Controller, Get, HttpStatus, Ip } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from 'src/auth/decorator/public.decorator';
import { AppValidation } from './app.validation';
import { AppService } from './app.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('hello')
  @Public()
  hello() {
    return this.appService.getHello();
  }

  @Get('real-ip')
  @Public()
  realIp(@Ip() ip: string) {
    return { ip };
  }

  @Get('error-codes')
  @Public()
  errorCodes() {
    return Object.entries(AppValidation).map(([key, value]) => ({
      key,
      code: value.code,
      message: value.message,
      statusCode: value.statusCode ?? HttpStatus.UNPROCESSABLE_ENTITY,
    }));
  }
}

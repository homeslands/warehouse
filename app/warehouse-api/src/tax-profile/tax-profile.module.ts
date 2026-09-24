import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { TaxProfileController } from './tax-profile.controller';
import { TaxProfileService } from './tax-profile.service';
import { TaxProfile } from './tax-profile.entity';
import { TaxProfileProfile } from './tax-profile.mapper';
import { VIETQR_TIMEOUT_MS } from './tax-profile.constants';

@Module({
  // `HttpModule` (`@nestjs/axios`, đã có sẵn trong deps và đang dùng ở `health`) — timeout khai ở
  // đây là hàng rào cuối; service vẫn truyền timeout theo từng request.
  imports: [
    TypeOrmModule.forFeature([TaxProfile]),
    HttpModule.register({ timeout: VIETQR_TIMEOUT_MS }),
  ],
  controllers: [TaxProfileController],
  providers: [TaxProfileService, TaxProfileProfile],
  exports: [TaxProfileService],
})
export class TaxProfileModule {}

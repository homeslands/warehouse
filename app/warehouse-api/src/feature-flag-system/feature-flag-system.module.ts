import { Global, Module } from '@nestjs/common';
import { FeatureFlagSystemService } from './feature-flag-system.service';

@Global()
@Module({
  providers: [FeatureFlagSystemService],
  exports: [FeatureFlagSystemService],
})
export class FeatureFlagSystemModule {}

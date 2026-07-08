import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../feature.decorator';
import { FeatureFlagSystemService } from '../feature-flag-system.service';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlagSystemService: FeatureFlagSystemService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const featureKey = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!featureKey) return true;

    if (!this.featureFlagSystemService.isEnabled(featureKey)) {
      throw new ForbiddenException(`Feature "${featureKey}" is currently disabled`);
    }
    return true;
  }
}

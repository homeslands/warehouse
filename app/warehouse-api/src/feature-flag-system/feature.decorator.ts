import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'feature';
// key theo format 'group:feature:child', ví dụ 'warehouse:import:auto-approve'
export const Feature = (key: string) => SetMetadata(FEATURE_KEY, key);

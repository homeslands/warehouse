import { SetMetadata } from '@nestjs/common';

export const REQUIRE_AUTHORITY_KEY = 'requireAuthority';
export const RequireAuthority = (code: string) => SetMetadata(REQUIRE_AUTHORITY_KEY, code);

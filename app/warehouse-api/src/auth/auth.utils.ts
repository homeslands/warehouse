import { Injectable } from '@nestjs/common';
import { User } from 'src/user/user.entity';
import { AuthException } from './auth.exception';
import { AuthValidation } from './auth.validation';

@Injectable()
export class AuthUtils {
  buildScope(user: User): string {
    const authorities = (user.role?.permissions ?? []).map(
      (permission) => permission.authority?.name,
    );
    return JSON.stringify(authorities.filter(Boolean));
  }
}

export function checkActiveUser(user: User): void {
  if (!user.isActive) {
    throw new AuthException(AuthValidation.USER_NOT_ACTIVE);
  }
}

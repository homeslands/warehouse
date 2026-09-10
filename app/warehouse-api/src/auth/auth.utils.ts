import { User } from 'src/user/user.entity';
import { AuthException } from './auth.exception';
import { AuthValidation } from './auth.validation';

// `AuthUtils.buildScope()` cũ đã bỏ: danh sách quyền giờ do `RbacService.refresh` tính và cache
// trên Redis — xem `src/rbac/`.
export function checkActiveUser(user: User): void {
  if (!user.isActive) {
    throw new AuthException(AuthValidation.USER_NOT_ACTIVE);
  }
}

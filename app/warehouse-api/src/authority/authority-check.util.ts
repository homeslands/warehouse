import { ForbiddenException } from '@nestjs/common';
import { RoleEnum } from 'src/role/role.enum';
import { CurrentUserDto } from 'src/user/user.decorator';
import { TAuthorityCode } from './authority.constants';

/**
 * Check quyền ở service khi `@RequireAuthority` (AND) không biểu diễn được. Cùng ngữ nghĩa với
 * `AuthorityGuard`: `SUPER_ADMIN` bypass, thiếu quyền ⇒ `ForbiddenException()` không message (403
 * như guard).
 */

/** Có ít nhất 1 trong `codes` (hoặc `SUPER_ADMIN`), không thì 403. */
export function assertHasAnyAuthority(
  currentUser: CurrentUserDto,
  codes: readonly TAuthorityCode[],
): void {
  if (currentUser.roleName === RoleEnum.SuperAdmin) return;
  const scope = currentUser.scope ?? [];
  if (!codes.some((code) => scope.includes(code))) throw new ForbiddenException();
}

/**
 * "Bản đầy đủ HOẶC bản `_OWN`" (cần dữ liệu bản ghi để biết "của mình"):
 * - có `fullCode` ⇒ được thao tác mọi bản ghi;
 * - chỉ có `ownCode` ⇒ chỉ bản ghi có `ownerId` = user hiện tại, khác ⇒ ném `notOwner()` (lỗi có
 *   mã của module gọi);
 * - không có cả hai ⇒ 403.
 */
export function assertFullOrOwnAuthority(
  currentUser: CurrentUserDto,
  fullCode: TAuthorityCode,
  ownCode: TAuthorityCode,
  ownerId: string | undefined,
  notOwner: () => Error,
): void {
  if (currentUser.roleName === RoleEnum.SuperAdmin) return;
  const scope = currentUser.scope ?? [];
  if (scope.includes(fullCode)) return;
  if (!scope.includes(ownCode)) throw new ForbiddenException();
  if (ownerId !== currentUser.userId) throw notOwner();
}

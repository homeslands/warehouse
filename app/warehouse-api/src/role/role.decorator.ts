import { SetMetadata } from '@nestjs/common';
import { CurrentUserDto } from 'src/user/user.decorator';
import { RoleEnum } from './role.enum';

export const HAS_ROLE_KEY = 'hasRole';

/**
 * RBAC cơ bản: khoá endpoint theo **role tĩnh** (`@HasRole(RoleEnum.Admin)`), đọc `roleName` từ
 * claim `role` của access token — không chạm DB/Redis, không phụ thuộc `permission_tbl`.
 *
 * Khác `@RequireAuthority(code)` (RBAC động, admin bật/tắt được lúc chạy, xem
 * `docs/specs/authority-permission.md`): quyền ở đây **cố định trong code**, muốn đổi phải sửa code
 * + deploy. Dùng cho endpoint mà việc phân quyền là bất biến của hệ thống (thao tác quản trị hạ
 * tầng, route chỉ dành cho `ADMIN`), hoặc khi chưa cần dựng `Authority` + migration seed cho nó.
 *
 * Gắn cả 2 decorator trên cùng 1 endpoint là **AND** (2 guard độc lập, phải qua cả hai).
 * `SUPER_ADMIN` bypass, giống `AuthorityGuard`.
 *
 * Nhận ít nhất 1 role (danh sách rỗng sẽ là lỗi compile): `@HasRole()` không chặn được gì mà trông
 * như đã chặn.
 */
export const HasRole = (...roles: [RoleEnum, ...RoleEnum[]]) => SetMetadata(HAS_ROLE_KEY, roles);

/**
 * Bản dùng trong service cho các rào **phụ thuộc dữ liệu** mà guard không biết được (vd: chỉ
 * `SUPER_ADMIN` mới được đụng vào tài khoản `SUPER_ADMIN` khác). Rào tĩnh theo endpoint thì dùng
 * decorator `@HasRole(...)` ở trên, đừng tự check trong service.
 */
export const hasRole = (user: CurrentUserDto | undefined, ...roles: RoleEnum[]): boolean =>
  !!user?.roleName && roles.includes(user.roleName as RoleEnum);

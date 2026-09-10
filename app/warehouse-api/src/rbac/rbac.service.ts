import { Injectable } from '@nestjs/common';
import { Role } from 'src/role/role.entity';
import { RoleService } from 'src/role/role.service';
import { User } from 'src/user/user.entity';
import { UserService } from 'src/user/user.service';
import { RbacCacheService } from './rbac-cache.service';

/**
 * Điểm vào duy nhất của RBAC cho phần còn lại của app (`JwtStrategy`, `AuthService`,
 * `PermissionService`). Xem `docs/specs/rbac.md`.
 *
 * Không dùng thư viện RBAC nào (`nestjs-rbac` đã gỡ): mô hình quyền của app chỉ là
 * `role → Authority.code[]`, không có action/filter/wildcard, nên phần "engine" gọn lại đúng
 * `authoritiesOfRole()` ngay trong service này.
 *
 * Cache CHỈ chứa quyền: `roleName` là claim trong JWT (ký lúc login/refresh), `userName` không được
 * cache (chỉ `GET /auth/me` cần, endpoint đó đọc DB).
 *
 * 2 lớp cache, đều fail-open (`RbacCacheService` nuốt lỗi Redis, MySQL vẫn là nguồn thật):
 * 1. `rbac:user:{userId}` — hit ⇒ request không chạm cả Redis-role lẫn MySQL.
 * 2. `rbac:role:{roleName}:authorities` — chỉ được hỏi khi lớp 1 miss, và luôn được hỏi **trước**
 *    khi query `role ⋈ permission ⋈ authority`.
 */
@Injectable()
export class RbacService {
  constructor(
    private readonly cacheService: RbacCacheService,
    private readonly roleService: RoleService,
    private readonly userService: UserService,
  ) {}

  /**
   * Dùng ở mỗi request có JWT. Cache hit ⇒ KHÔNG chạm MySQL. Miss (hết TTL sau refresh, Redis
   * restart, value hỏng, Redis lỗi) ⇒ đọc DB, tính lại, ghi lại cache với đủ TTL.
   * Trả `null` khi user không còn / bị khoá — caller (`JwtStrategy`) đổi thành 401.
   */
  async resolve(userId: string): Promise<string[] | null> {
    const cached = await this.cacheService.get(userId);
    if (cached) return cached;

    const user = await this.userService.findById(userId);
    if (!user || !user.isActive) return null;

    return this.refresh(user);
  }

  /**
   * Tính lại quyền của 1 user và GHI ĐÈ cache per-user — gọi ở login/refresh và ở nhánh miss của
   * `resolve`. `user` cần có `role` (eager trên `User` nên mọi `findOne*` đều có).
   */
  async refresh(user: User): Promise<string[]> {
    const roleName = user.role?.name;
    const permissions = roleName ? await this.authoritiesOfRole(roleName) : [];

    await this.cacheService.set(user.id, permissions);
    return permissions;
  }

  /**
   * `Authority.code` mà 1 role đang được cấp — **Redis trước, MySQL sau**: chỉ khi
   * `rbac:role:{roleName}:authorities` miss mới join `role ⋈ permission ⋈ authority`, rồi ghi lại
   * cache. Role không tồn tại cũng trả `[]` (và cache lại `[]`) — user mang role rác thì mất quyền,
   * không phải lỗi.
   */
  async authoritiesOfRole(roleName: string): Promise<string[]> {
    const cached = await this.cacheService.getRoleAuthorities(roleName);
    if (cached) return cached;

    const role = await this.roleService.findByNameWithAuthorities(roleName);
    const codes = this.extractAuthorityCodes(role);

    await this.cacheService.setRoleAuthorities(roleName, codes);
    return codes;
  }

  /**
   * `role.permissions[].authority.code` đã khử trùng lặp. Bỏ qua permission mồ côi (authority đã bị
   * xoá) và relation chưa nạp. `SUPER_ADMIN` KHÔNG được cấp đặc biệt ở đây — bypass nằm ở
   * `AuthorityGuard`.
   */
  private extractAuthorityCodes(role: Role | null): string[] {
    return [
      ...new Set(
        (role?.permissions ?? [])
          .map((permission) => permission.authority?.code)
          .filter((code): code is string => Boolean(code)),
      ),
    ];
  }

  /**
   * Quyền của 1 role vừa đổi (grant/revoke): xoá cache của MỌI user thuộc role đó + cache authority
   * của chính role đó, để request kế tiếp tính lại từ DB — giữ cam kết "bật/tắt quyền có hiệu lực
   * ngay" của `docs/specs/authority-permission.md`. Gọi SAU khi đã ghi DB.
   */
  async invalidateRole(role: Role): Promise<void> {
    const userIds = await this.userService.findIdsByRoleId(role.id);
    await this.cacheService.delUsers(userIds);
    await this.cacheService.delRole(role.name);
  }
}

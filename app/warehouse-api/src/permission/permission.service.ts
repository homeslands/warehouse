import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Permission } from './permission.entity';
import { RoleException } from 'src/role/role.exception';
import { RoleValidation } from 'src/role/role.validation';
import { AuthorityException } from 'src/authority/authority.exception';
import { AuthorityValidation } from 'src/authority/authority.validation';
import { RoleService } from 'src/role/role.service';
import { AuthorityService } from 'src/authority/authority.service';
import { RbacService } from 'src/rbac/rbac.service';
import { RoleEnum } from 'src/role/role.enum';
import { CurrentUserDto } from 'src/user/user.decorator';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission) private readonly permissionRepository: Repository<Permission>,
    private readonly roleService: RoleService,
    private readonly authorityService: AuthorityService,
    private readonly rbacService: RbacService,
  ) {}

  private async resolve(roleSlug: string, authorityCode: string) {
    const role = await this.roleService.findBySlug(roleSlug);
    if (!role) throw new RoleException(RoleValidation.ROLE_NOT_FOUND);

    const authority = await this.authorityService.findByCode(authorityCode);
    if (!authority) throw new AuthorityException(AuthorityValidation.AUTHORITY_NOT_FOUND);

    return { role, authority };
  }

  // Bật quyền — idempotent, gọi lại không lỗi (xem docs/specs/authority-permission.md).
  // 2 rào trước khi ghi: role đích phải thấp cấp hơn role của người thao tác, và người thao tác chỉ
  // cấp được authority mà chính role của họ đang có — `actor.scope` là đúng tập đó, đã được
  // `JwtStrategy` nạp từ cache RBAC (bị xoá mỗi khi grant/revoke) nên không cần query lại.
  // Xoá cache RBAC SAU khi ghi DB để request kế tiếp của user thuộc role này tính lại quyền ngay
  // (xem docs/specs/rbac.md); nhánh "đã có" không đổi gì nên không cần xoá.
  async grant(actor: CurrentUserDto, roleSlug: string, authorityCode: string): Promise<void> {
    const { role, authority } = await this.resolve(roleSlug, authorityCode);
    await this.roleService.assertCanManage(actor, role);
    if (actor.roleName !== RoleEnum.SuperAdmin && !actor.scope.includes(authority.code)) {
      throw new AuthorityException(AuthorityValidation.AUTHORITY_NOT_OWNED);
    }

    const existed = await this.permissionRepository.findOne({
      where: { role: { id: role.id }, authority: { id: authority.id } },
    });
    if (existed) return;

    await this.permissionRepository.save(this.permissionRepository.create({ role, authority }));
    await this.rbacService.invalidateRole(role);
  }

  // Tắt quyền — idempotent, gọi lại không lỗi. Thu hồi LAN XUỐNG: mọi role cấp thấp hơn role đích
  // cũng mất authority này, để giữ bất biến "cấp dưới chỉ có tối đa quyền của cấp trên".
  async revoke(actor: CurrentUserDto, roleSlug: string, authorityCode: string): Promise<void> {
    const { role, authority } = await this.resolve(roleSlug, authorityCode);
    await this.roleService.assertCanManage(actor, role);

    const affectedRoles = [role, ...(await this.roleService.findLowerRoles(role.level))];
    await this.permissionRepository.delete({
      role: { id: In(affectedRoles.map((r) => r.id)) },
      authority: { id: authority.id },
    });
    for (const affected of affectedRoles) {
      await this.rbacService.invalidateRole(affected);
    }
  }
}

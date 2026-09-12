import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from './permission.entity';
import { RoleException } from 'src/role/role.exception';
import { RoleValidation } from 'src/role/role.validation';
import { AuthorityException } from 'src/authority/authority.exception';
import { AuthorityValidation } from 'src/authority/authority.validation';
import { RoleService } from 'src/role/role.service';
import { AuthorityService } from 'src/authority/authority.service';
import { RbacService } from 'src/rbac/rbac.service';

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
  // Xoá cache RBAC SAU khi ghi DB để request kế tiếp của user thuộc role này tính lại quyền ngay
  // (xem docs/specs/rbac.md); nhánh "đã có" không đổi gì nên không cần xoá.
  async grant(roleSlug: string, authorityCode: string): Promise<void> {
    const { role, authority } = await this.resolve(roleSlug, authorityCode);

    const existed = await this.permissionRepository.findOne({
      where: { role: { id: role.id }, authority: { id: authority.id } },
    });
    if (existed) return;

    await this.permissionRepository.save(this.permissionRepository.create({ role, authority }));
    await this.rbacService.invalidateRole(role);
  }

  // Tắt quyền — idempotent, gọi lại không lỗi.
  async revoke(roleSlug: string, authorityCode: string): Promise<void> {
    const { role, authority } = await this.resolve(roleSlug, authorityCode);
    await this.permissionRepository.delete({
      role: { id: role.id },
      authority: { id: authority.id },
    });
    await this.rbacService.invalidateRole(role);
  }
}

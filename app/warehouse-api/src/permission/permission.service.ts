import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Authority } from 'src/authority/authority.entity';
import { Permission } from './permission.entity';
import { Role } from 'src/role/role.entity';
import { RoleException } from 'src/role/role.exception';
import { RoleValidation } from 'src/role/role.validation';
import { AuthorityException } from 'src/authority/authority.exception';
import { AuthorityValidation } from 'src/authority/authority.validation';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectRepository(Authority) private readonly authorityRepository: Repository<Authority>,
    @InjectRepository(Permission) private readonly permissionRepository: Repository<Permission>,
  ) {}

  private async resolve(
    roleSlug: string,
    authorityCode: string,
  ): Promise<{ role: Role; authority: Authority }> {
    const role = await this.roleRepository.findOneBy({ slug: roleSlug });
    if (!role) throw new RoleException(RoleValidation.ROLE_NOT_FOUND);

    const authority = await this.authorityRepository.findOneBy({ code: authorityCode });
    if (!authority) throw new AuthorityException(AuthorityValidation.AUTHORITY_NOT_FOUND);

    return { role, authority };
  }

  // Bật quyền — idempotent, gọi lại không lỗi (xem docs/specs/authority-permission.md).
  async grant(roleSlug: string, authorityCode: string): Promise<void> {
    const { role, authority } = await this.resolve(roleSlug, authorityCode);

    const existed = await this.permissionRepository.findOne({
      where: { role: { id: role.id }, authority: { id: authority.id } },
    });
    if (existed) return;

    await this.permissionRepository.save(this.permissionRepository.create({ role, authority }));
  }

  // Tắt quyền — idempotent, gọi lại không lỗi.
  async revoke(roleSlug: string, authorityCode: string): Promise<void> {
    const { role, authority } = await this.resolve(roleSlug, authorityCode);
    await this.permissionRepository.delete({
      role: { id: role.id },
      authority: { id: authority.id },
    });
  }
}

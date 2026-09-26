import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { Role } from './role.entity';
import { CreateRoleRequestDto, RoleResponseDto, UpdateRoleRequestDto } from './role.dto';
import { RoleException } from './role.exception';
import { RoleValidation } from './role.validation';
import { RoleEnum } from './role.enum';
import { CurrentUserDto } from 'src/user/user.decorator';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectMapper() private readonly mapper: Mapper,
  ) {}

  async findAll(): Promise<RoleResponseDto[]> {
    const roles = await this.roleRepository.find({
      relations: { permissions: { authority: true } },
      order: { createdAt: 'ASC' },
    });
    return this.mapper.mapArray(roles, Role, RoleResponseDto);
  }

  async findOne(slug: string): Promise<RoleResponseDto> {
    const role = await this.roleRepository.findOne({
      where: { slug },
      relations: { permissions: { authority: true } },
    });
    if (!role) throw new RoleException(RoleValidation.ROLE_NOT_FOUND);
    return this.mapper.map(role, Role, RoleResponseDto);
  }

  async findBySlug(slug: string): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { slug },
    });
  }

  async findByName(name: string): Promise<Role | null> {
    return this.roleRepository.findOneBy({ name });
  }

  // Nguồn cho `RbacService.authoritiesOfRole()`: 1 role kèm authority code đang được cấp, chỉ được
  // gọi khi cache Redis của role đó miss. Trả entity (không map DTO) vì caller là hạ tầng, không
  // phải response API. Tra theo `name` chứ không phải `slug` vì đó là thứ nằm trong JWT/cache.
  async findByNameWithAuthorities(name: string): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { name },
      relations: { permissions: { authority: true } },
    });
  }

  // Mọi role cấp thấp hơn `level` — cho revoke lan xuống ở `PermissionService.revoke`.
  async findLowerRoles(level: number): Promise<Role[]> {
    return this.roleRepository.find({ where: { level: LessThan(level) } });
  }

  /**
   * Cấp của người thao tác. `SUPER_ADMIN` ⇒ `Infinity` (bypass, nhất quán với `AuthorityGuard`).
   * Token không có claim `role` hoặc role đã bị xoá ⇒ fail-closed: coi như không quản lý được ai.
   */
  async actorLevel(actor: CurrentUserDto): Promise<number> {
    if (actor.roleName === RoleEnum.SuperAdmin) return Infinity;
    const role = actor.roleName ? await this.findByName(actor.roleName) : null;
    if (!role) throw new RoleException(RoleValidation.ROLE_LEVEL_FORBIDDEN);
    return role.level;
  }

  /**
   * Chỉ được sửa quyền / tạo / gán role có cấp THẤP HƠN cấp của mình — ngang cấp cũng không (nếu
   * không, ADMIN tự cấp thêm quyền cho chính role ADMIN là leo thang đặc quyền).
   */
  async assertCanManage(actor: CurrentUserDto, target: Role | number): Promise<void> {
    const targetLevel = typeof target === 'number' ? target : target.level;
    if (targetLevel >= (await this.actorLevel(actor))) {
      throw new RoleException(RoleValidation.ROLE_LEVEL_FORBIDDEN);
    }
  }

  async create(actor: CurrentUserDto, dto: CreateRoleRequestDto): Promise<RoleResponseDto> {
    await this.assertCanManage(actor, dto.level);

    const existed = await this.roleRepository.findOneBy({ name: dto.name });
    if (existed) throw new RoleException(RoleValidation.ROLE_NAME_ALREADY_EXISTS);

    const role = this.roleRepository.create({
      name: dto.name,
      description: dto.description,
      level: dto.level,
    });
    const created = await this.roleRepository.save(role);
    return this.mapper.map(created, Role, RoleResponseDto);
  }

  async update(
    actor: CurrentUserDto,
    slug: string,
    dto: UpdateRoleRequestDto,
  ): Promise<RoleResponseDto> {
    const role = await this.roleRepository.findOneBy({ slug });
    if (!role) throw new RoleException(RoleValidation.ROLE_NOT_FOUND);
    await this.assertCanManage(actor, role);

    if (dto.description !== undefined) role.description = dto.description;
    const updated = await this.roleRepository.save(role);
    return this.mapper.map(updated, Role, RoleResponseDto);
  }
}

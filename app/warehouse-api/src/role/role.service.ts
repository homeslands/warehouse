import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { Role } from './role.entity';
import { CreateRoleRequestDto, RoleResponseDto, UpdateRoleRequestDto } from './role.dto';
import { RoleException } from './role.exception';
import { RoleValidation } from './role.validation';

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

  async create(dto: CreateRoleRequestDto): Promise<RoleResponseDto> {
    const existed = await this.roleRepository.findOneBy({ name: dto.name });
    if (existed) throw new RoleException(RoleValidation.ROLE_NAME_ALREADY_EXISTS);

    const role = this.roleRepository.create({ name: dto.name, description: dto.description });
    const created = await this.roleRepository.save(role);
    return this.mapper.map(created, Role, RoleResponseDto);
  }

  async update(slug: string, dto: UpdateRoleRequestDto): Promise<RoleResponseDto> {
    const role = await this.roleRepository.findOneBy({ slug });
    if (!role) throw new RoleException(RoleValidation.ROLE_NOT_FOUND);

    if (dto.description !== undefined) role.description = dto.description;
    const updated = await this.roleRepository.save(role);
    return this.mapper.map(updated, Role, RoleResponseDto);
  }
}

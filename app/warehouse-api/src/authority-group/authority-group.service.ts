import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { AuthorityGroup } from './authority-group.entity';
import { AuthorityGroupResponseDto } from './authority-group.dto';

@Injectable()
export class AuthorityGroupService {
  constructor(
    @InjectRepository(AuthorityGroup)
    private readonly authorityGroupRepository: Repository<AuthorityGroup>,
    @InjectMapper() private readonly mapper: Mapper,
  ) {}

  async findAll(): Promise<AuthorityGroupResponseDto[]> {
    const groups = await this.authorityGroupRepository.find({ order: { createdAt: 'ASC' } });
    return this.mapper.mapArray(groups, AuthorityGroup, AuthorityGroupResponseDto);
  }

  async findBySlug(slug: string): Promise<AuthorityGroup | null> {
    return this.authorityGroupRepository.findOneBy({ slug });
  }
}

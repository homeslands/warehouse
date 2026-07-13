import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { AuthorityGroup } from 'src/authority-group/authority-group.entity';
import { AuthorityGroupException } from 'src/authority-group/authority-group.exception';
import { AuthorityGroupValidation } from 'src/authority-group/authority-group.validation';
import { Authority } from './authority.entity';
import {
  AuthorityResponseDto,
  GetAllAuthorityRequestDto,
  UpdateAuthorityRequestDto,
} from './authority.dto';
import { AuthorityException } from './authority.exception';
import { AuthorityValidation } from './authority.validation';

@Injectable()
export class AuthorityService {
  constructor(
    @InjectRepository(Authority) private readonly authorityRepository: Repository<Authority>,
    @InjectRepository(AuthorityGroup)
    private readonly authorityGroupRepository: Repository<AuthorityGroup>,
    @InjectMapper() private readonly mapper: Mapper,
  ) {}

  async findAll(query: GetAllAuthorityRequestDto): Promise<AuthorityResponseDto[]> {
    const where: FindOptionsWhere<Authority> = {};
    if (query.authorityGroupSlug) {
      where.authorityGroup = { slug: query.authorityGroupSlug };
    }
    const authorities = await this.authorityRepository.find({ where, order: { createdAt: 'ASC' } });
    return this.mapper.mapArray(authorities, Authority, AuthorityResponseDto);
  }

  async updateAuthority(
    slug: string,
    dto: UpdateAuthorityRequestDto,
  ): Promise<AuthorityResponseDto> {
    const authority = await this.authorityRepository.findOneBy({ slug });
    if (!authority) throw new AuthorityException(AuthorityValidation.AUTHORITY_NOT_FOUND);

    if (dto.name) authority.name = dto.name;
    if (dto.authorityGroupSlug) {
      const group = await this.authorityGroupRepository.findOneBy({
        slug: dto.authorityGroupSlug,
      });
      if (!group)
        throw new AuthorityGroupException(AuthorityGroupValidation.AUTHORITY_GROUP_NOT_FOUND);
      authority.authorityGroup = group;
    }

    const updated = await this.authorityRepository.save(authority);
    return this.mapper.map(updated, Authority, AuthorityResponseDto);
  }
}

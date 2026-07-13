import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { Role } from 'src/role/role.entity';
import { CreateUserRequestDto, GetAllUserRequestDto, UserResponseDto } from './user.dto';
import { UserException } from './user.exception';
import { UserValidation } from './user.validation';
import { RoleException } from 'src/role/role.exception';
import { RoleValidation } from 'src/role/role.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';

@Injectable()
export class UserService {
  private readonly saltRounds: number;

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectMapper() private readonly mapper: Mapper,
    private readonly configService: ConfigService,
  ) {
    this.saltRounds = parseInt(this.configService.get('SALT_ROUNDS'), 10);
  }

  async createUser(dto: CreateUserRequestDto): Promise<UserResponseDto> {
    const existed = await this.userRepository.findOneBy({ phonenumber: dto.phonenumber });
    if (existed) throw new UserException(UserValidation.USER_PHONENUMBER_DOES_EXIST);

    const role = await this.roleRepository.findOneBy({ slug: dto.roleSlug });
    if (!role) throw new RoleException(RoleValidation.ROLE_NOT_FOUND);

    const data = this.mapper.map(dto, CreateUserRequestDto, User);
    const hashedPassword = await bcrypt.hash(dto.password, this.saltRounds);

    const user = this.userRepository.create({
      ...data,
      password: hashedPassword,
      role,
    });
    const created = await this.userRepository.save(user);
    return this.mapper.map(created, User, UserResponseDto);
  }

  async findAll(query: GetAllUserRequestDto): Promise<AppPaginatedResponseDto<UserResponseDto>> {
    const options: FindManyOptions<User> = {
      where: query.roleSlug ? { role: { slug: query.roleSlug } } : undefined,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    };
    const [items, total] = await this.userRepository.findAndCount(options);
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, User, UserResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<UserResponseDto>;
  }
}

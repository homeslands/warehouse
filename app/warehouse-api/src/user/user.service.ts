import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Repository } from 'typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import {
  ChangeUserPasswordRequestDto,
  ChangeUserPasswordResponseDto,
  CreateUserRequestDto,
  GetAllUserRequestDto,
  UserResponseDto,
} from './user.dto';
import { UserException } from './user.exception';
import { UserValidation } from './user.validation';
import { RoleException } from 'src/role/role.exception';
import { RoleValidation } from 'src/role/role.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';
import { RoleService } from 'src/role/role.service';
import { RoleEnum } from 'src/role/role.enum';
import { CurrentUserDto } from './user.decorator';
import { TokenRevocationService } from 'src/auth/token-revocation.service';

@Injectable()
export class UserService {
  private readonly saltRounds: number;

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectMapper() private readonly mapper: Mapper,
    private readonly configService: ConfigService,
    private readonly roleService: RoleService,
    private readonly tokenRevocationService: TokenRevocationService,
  ) {
    this.saltRounds = parseInt(this.configService.get('SALT_ROUNDS'), 10);
  }

  async createUser(dto: CreateUserRequestDto): Promise<UserResponseDto> {
    const existed = await this.userRepository.findOneBy({ phonenumber: dto.phonenumber });
    if (existed) throw new UserException(UserValidation.USER_PHONENUMBER_DOES_EXIST);

    const role = await this.roleService.findBySlug(dto.roleSlug);
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

  async findByPhoneNumber(phonenumber: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { phonenumber },
      relations: { role: { permissions: { authority: { authorityGroup: true } } } },
    });
  }

  // Nạp kèm role/permissions để JwtStrategy tính lại scope mỗi request.
  async findByIdWithAuthorities(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: { role: { permissions: { authority: { authorityGroup: true } } } },
    });
  }

  async findBySlug(slug: string): Promise<User | null> {
    return this.userRepository.findOneBy({ slug });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, this.saltRounds);
    await this.userRepository.update({ id }, { password: hashedPassword });
  }

  /**
   * Đổi mật khẩu HỘ user khác (`POST /users/{userSlug}/change-password`) — quyền tĩnh, đã được
   * `AuthorityGuard` chặn bằng `@RequireAuthority('USER_CHANGE_PASSWORD')` (`ADMIN`/`MANAGER` được
   * seed sẵn, `SUPER_ADMIN` bypass) trước khi vào đây. Không hỏi mật khẩu hiện tại vì người gọi
   * không biết mật khẩu cũ của user đó — tự đổi mật khẩu của mình thì đi `POST /auth/change-password`.
   *
   * Chỉ thu hồi phiên của user BỊ ĐỔI; token của người gọi không bị đụng tới, nên không trả token.
   */
  async changeUserPassword(
    currentUser: CurrentUserDto,
    userSlug: string,
    dto: ChangeUserPasswordRequestDto,
  ): Promise<ChangeUserPasswordResponseDto> {
    const target = await this.findBySlug(userSlug);
    if (!target) throw new UserException(UserValidation.USER_NOT_FOUND);

    this.assertCanChangeOtherPassword(currentUser, target);

    await this.updatePassword(target.id, dto.newPassword);
    await this.tokenRevocationService.revokeAllTokensForUser(target.id);

    return { userSlug: target.slug };
  }

  /**
   * Endpoint đổi hộ KHÔNG dùng để tự đổi: nó không hỏi mật khẩu hiện tại, cho phép trỏ vào chính
   * mình là mở đường cho người cầm access token bị đánh cắp của admin đổi mật khẩu tài khoản đó mà
   * không cần biết mật khẩu cũ. Bắt đi qua `POST /auth/change-password`.
   *
   * Chặn thêm leo thang đặc quyền: người không phải `SUPER_ADMIN` không được đổi mật khẩu của một
   * `SUPER_ADMIN` — nếu không, bất kỳ ai được cấp `USER_CHANGE_PASSWORD` (theo yêu cầu là
   * `ADMIN`/`MANAGER`) đều có thể reset mật khẩu tài khoản root rồi đăng nhập bằng chính nó.
   */
  private assertCanChangeOtherPassword(currentUser: CurrentUserDto, target: User): void {
    if (target.id === currentUser.userId) {
      throw new UserException(UserValidation.CHANGE_OWN_PASSWORD_NOT_ALLOWED);
    }
    if (currentUser.roleName === RoleEnum.SuperAdmin) return;
    if (target.role?.name === RoleEnum.SuperAdmin) {
      throw new UserException(UserValidation.CHANGE_PASSWORD_FORBIDDEN);
    }
  }
}

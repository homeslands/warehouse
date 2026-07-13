# Plan: Implement User module (create + list, gán role)

## Context

Từ khi bỏ `POST /auth/register` (self-registration đã xoá vì role `CUSTOMER` không còn), tài khoản mới chỉ có thể tạo thủ công qua DB. Feature này bổ sung API để người có quyền quản trị tạo user mới (kèm gán role ngay lúc tạo) và xem danh sách user (lọc theo role) — theo spec đã viết ở `docs/specs/user.md`. Entity `User`/`Role`, decorator `CurrentUser` đã có sẵn (`src/user/user.entity.ts`, `src/user/user.decorator.ts`, `src/role/role.entity.ts`); chưa có controller/service nào thao tác `User`.

## Đã khảo sát (không cần Explore agent thêm — đã đọc trực tiếp trong phiên làm việc này)

- Convention module chuẩn: `src/example/` (9 file: controller/service/dto/mapper/exception/validation/module + entity, 2 spec).
- `src/role/role.module.ts` export `TypeOrmModule` → module khác `imports: [RoleModule]` để lấy `Repository<Role>` mà không tự `forFeature` trùng (đúng cách `PermissionModule` đang làm, theo `docs/plans/authority-permission.md`).
- `AuthService` (`src/auth/auth.service.ts`) hash password bằng `bcrypt.hash(pw, this.saltRounds)`, `saltRounds = parseInt(configService.get('SALT_ROUNDS'), 10)` — tái dùng đúng cách này trong `UserService`.
- Mã lỗi hiện có theo dải: `auth` 1000xx, `role` 1001xx, `authority` 1002xx, `authority-group` 1003xx, `example` 999901+. Dải `1004xx` chưa ai dùng → dùng cho `user`.
- Pattern seed authority mới + cấp cho `ADMIN`: migration `1783728000009-seed-authority-permission.ts` (tạo `AuthorityGroup`, `Authority` có `code`, rồi insert `Permission` nối với role `ADMIN`). Copy đúng pattern này cho authority mới của `user`.
- `RoleResponseDto` (`src/role/role.dto.ts`) cần relation `permissions.authority` mới map được `authorityCodes` — không tái dùng nguyên DTO này cho response của User (tránh phải load thêm relation không cần); thay vào đó expose phẳng `roleSlug`/`roleName` trên `UserResponseDto`.

## Các bước implement

### 1. Tạo `src/user/` (bổ sung cạnh `user.entity.ts`, `user.decorator.ts` đã có sẵn)

- **`user.dto.ts`**:
  - `CreateUserRequestDto`: `phonenumber` (`@IsNotEmpty({message: 'USER_PHONENUMBER_IS_REQUIRED'})`), `password` (`@IsNotEmpty({message: 'USER_PASSWORD_IS_REQUIRED'})`), `roleSlug` (`@IsNotEmpty({message: 'USER_ROLE_SLUG_IS_REQUIRED'})`).
  - `GetAllUserRequestDto extends BaseQueryDto` + `roleSlug?: string` (`@IsOptional()`).
  - `UserResponseDto extends BaseResponseDto`: `phonenumber`, `isActive`, `roleSlug`, `roleName` — **không có field `password`**.
- **`user.mapper.ts`** (`UserProfile extends AutomapperProfile`, đăng ký provider trong module):
  - `createMap(mapper, User, UserResponseDto, baseMapper(), forMember(d => d.roleSlug, mapFrom(s => s.role?.slug)), forMember(d => d.roleName, mapFrom(s => s.role?.name)))`.
  - `createMap(mapper, CreateUserRequestDto, User, forMember(d => d.phonenumber, mapFrom(s => s.phonenumber?.trim())))` — chỉ map field scalar, **không map `role`/`password` qua automapper** (gán tay trong service sau khi hash/lookup, giống cách `AuthService.register` cũ từng làm).
- **`user.exception.ts`**: `UserException extends AppException`, giống nguyên `example.exception.ts`.
- **`user.validation.ts`**: dải `1004xx`.
  ```ts
  USER_PHONENUMBER_DOES_EXIST: createErrorCode(100401, 'Phone number already exists'),
  USER_PHONENUMBER_IS_REQUIRED: createErrorCode(100402, 'Phone number is required', HttpStatus.BAD_REQUEST),
  USER_PASSWORD_IS_REQUIRED: createErrorCode(100403, 'Password is required', HttpStatus.BAD_REQUEST),
  USER_ROLE_SLUG_IS_REQUIRED: createErrorCode(100404, 'Role slug is required', HttpStatus.BAD_REQUEST),
  ```
- **`user.service.ts`**:
  - Constructor inject `@InjectRepository(User)`, `@InjectRepository(Role)` (từ `RoleModule` export), `@InjectMapper()`, `ConfigService` (đọc `SALT_ROUNDS`).
  - `createUser(dto)`: check `userRepository.findOneBy({ phonenumber: dto.phonenumber })` → nếu có, throw `UserException(UserValidation.USER_PHONENUMBER_DOES_EXIST)`. Tìm role: `roleRepository.findOneBy({ slug: dto.roleSlug })` → không có, throw `RoleException(RoleValidation.ROLE_NOT_FOUND)` (tái dùng, không tạo lỗi riêng — đúng spec). Hash password (`bcrypt.hash`), map scalar field qua mapper, gán `role`, `save`, map kết quả sang `UserResponseDto`.
  - `findAll(query: GetAllUserRequestDto)`: `FindManyOptions<User>` với `where: query.roleSlug ? { role: { slug: query.roleSlug } } : undefined`, `order: { createdAt: 'DESC' }`, `skip`/`take` theo `page`/`size` — giống hệt `ExampleService.findAll`. Trả `AppPaginatedResponseDto<UserResponseDto>`.
- **`user.module.ts`**: `imports: [TypeOrmModule.forFeature([User]), RoleModule]`, `controllers: [UserController]`, `providers: [UserService, UserProfile]`, `exports: [UserService]`.
- **`user.controller.ts`** (`@ApiTags('User')`, `@Controller('users')`, `@ApiBearerAuth()`):
  - `POST /users` — `@RequireAuthority('USER_CREATE')`, `ValidationPipe({transform:true, whitelist:true})` cho body, response `AppResponseDto<UserResponseDto>` status 201.
  - `GET /users` — `@RequireAuthority('USER_READ')`, `ValidationPipe` cho query, response `AppPaginatedResponseDto<UserResponseDto>` (dùng `@ApiPaginatedResponse` như `ExampleController.findAll`).
- 2 file spec: `user.controller.spec.ts`, `user.service.spec.ts` — theo mẫu `example.controller.spec.ts`/`example.service.spec.ts`, test: tạo thành công, trùng phonenumber → lỗi, role không tồn tại → lỗi, response không chứa `password`, list lọc theo `roleSlug`.

### 2. Đăng ký

- `src/app/app.module.ts`: thêm `import { UserModule } from 'src/user/user.module'` + vào mảng `imports` (cạnh `ExampleModule`).
- `src/app/app.validation.ts`: thêm `import { UserValidation, TUserErrorCode } from 'src/user/user.validation'`, gộp vào `TErrorCodeValue` type intersection và `AppValidation` object (giống các module khác).

### 3. Migration — seed authority mới (bắt buộc kèm theo `@RequireAuthority('USER_CREATE'|'USER_READ')`, theo `docs/WORKFLOW.md` bước 6)

File mới `src/migrations/<ts>-seed-user-authority.ts`, copy đúng pattern `1783728000009-seed-authority-permission.ts`:
- Tạo 1 `AuthorityGroup` mới: `{ slug: 'user-management', name: 'User Management' }`.
- Tạo 2 `Authority`: `{ slug: 'user-create', name: 'Create user', code: 'USER_CREATE' }`, `{ slug: 'user-read', name: 'List user', code: 'USER_READ' }`, cùng group trên.
- Insert `Permission` nối 2 authority này với role `ADMIN` (query `SELECT id_column FROM role_tbl WHERE name_column = 'ADMIN'`) — để hành vi ngay sau migrate không đổi (ADMIN vẫn dùng được như trước khi có authority-gating).
- `down()`: xoá đúng permission/authority/authority-group vừa tạo (theo `slug`/`code`), đối xứng với `up()`.

Không cần migration đổi schema `user_tbl` — entity/bảng đã có sẵn từ `1783728000002-create-user-table.ts`, không thêm field mới.

## File sẽ tạo/sửa

```
src/user/user.dto.ts            (mới)
src/user/user.mapper.ts         (mới)
src/user/user.exception.ts      (mới)
src/user/user.validation.ts     (mới)
src/user/user.service.ts        (mới)
src/user/user.controller.ts     (mới)
src/user/user.module.ts         (mới)
src/user/user.controller.spec.ts (mới)
src/user/user.service.spec.ts    (mới)
src/app/app.module.ts            (sửa — thêm UserModule)
src/app/app.validation.ts        (sửa — thêm UserValidation)
src/migrations/<ts>-seed-user-authority.ts (mới)
```

## Verify

1. `npm run lint`, `npm run test` — bắt buộc pass, kể cả guard chống trùng mã lỗi trong `app.validation.ts` (throw lúc khởi động nếu trùng code).
2. `npm run typeorm:r` sau khi review diff migration mới.
3. Chạy skill `verify-feature` (app thật): login bằng root (`SUPER_ADMIN`, bypass authority) → `POST /users` tạo user role `SUPERVISOR`/`MANAGER` → xác nhận response không có `password`; `GET /users?roleSlug=...` → đúng user vừa tạo; tạo trùng `phonenumber` → nhận lỗi `USER_PHONENUMBER_DOES_EXIST` (422); `roleSlug` sai → lỗi `ROLE_NOT_FOUND`. Login bằng user role `ADMIN` (được cấp `USER_CREATE`/`USER_READ` qua migration seed) → gọi lại 2 route trên phải thành công; role chưa được cấp quyền (vd `MANAGER`) gọi → 403.

# warehouse-api

NestJS 10 + TypeORM/MySQL. `setup.md` trong thư mục này là ghi chú thủ công về các bước setup ban đầu (env, DB, chạy app lần đầu) — không phải tài liệu convention cho Claude, không cần đọc trừ khi cần setup môi trường từ đầu.

> `src/` hiện có: `app/`, `auth/`, `authority/`, `authority-group/`, `config/`, `db/`, `example/` (module mẫu), `feature-flag-system/`, `file/` (S3), `health/`, `logger/`, `material/`, `material-type/`, `migrations/`, `notification/firebase/`, `permission/`, `rbac/`, `redis/`, `role/`, `shared/`, `unit/`, `user/`, `warehouse/`, `warehouse-material/`. Module nghiệp vụ đã có: kho (`warehouse`), danh mục vật tư (`material-type`/`material`) và tồn kho theo kho (`warehouse-material`) — xem `docs/specs/material.md`. Chưa có phiếu nhập/xuất/kiểm kho; tạo mới theo template `example/`.

## Quy trình làm feature mới

Xem `docs/WORKFLOW.md` — spec (`docs/specs/`) → plan (`docs/plans/`, đã cấu hình `plansDirectory`) → code (`/new-feature <tên>` hoặc trực tiếp) → auto-lint (hook) → migration → verify (lint/test). `docs/specs/_TEMPLATE.md`/`docs/specs/product.md` là template/ví dụ spec. Khi có file spec, đọc nó trước, đối chiếu convention trong file này, rồi lập plan trước khi code — không tự đoán quy tắc nghiệp vụ nếu spec chưa nói rõ, hỏi lại thay vì giả định.

## Lệnh hay dùng

```bash
npm run dev            # nest start -w (watch mode)
npm run start:debug    # kèm debugger
npm run lint            # eslint --fix trên src/apps/libs/test
npm run format           # prettier --write src, test
npm run test             # unit test (jest, *.spec.ts)
npm run test:watch
npm run test:cov
npm run test:e2e         # jest --config ./test/jest-e2e.json (*.e2e-spec.ts)
npm run build             # lint + nest build -> dist/
npm run start              # node dist/main (production)
```

## Migration (TypeORM CLI — không dùng `synchronize`)

```bash
npm run typeorm:g --name=create-<feature>-table   # generate từ thay đổi entity
npm run typeorm:c --name=<ten>                    # tạo migration rỗng
npm run typeorm:r                                 # chạy migration
npm run typeorm:rv                                # revert migration gần nhất — HỎI USER TRƯỚC KHI CHẠY
```

Sau khi thêm/sửa entity: luôn generate migration tương ứng, không sửa tay DB/không bật `synchronize`.

## Sau khi sửa code, trước khi báo xong việc

1. `npm run lint` — bắt buộc (script `build` cũng chạy lint trước khi build).
2. `npm run test`, và `npm run test:e2e` nếu đổi route/hành vi API.

## Cấu trúc 1 module (tham khảo `src/example/` — có thật trong code, đã đăng ký sẵn)

```
<feature>/
├── <feature>.controller.ts     # route, @ApiTags, ValidationPipe theo từng param
├── <feature>.service.ts        # business logic, inject Repository<Entity> trực tiếp
├── <feature>.module.ts         # TypeOrmModule.forFeature([Entity]), khai báo controller/service/profile
├── <feature>.entity.ts         # extends Base (hoặc VersionedBase), @Entity('<feature>_tbl')
├── <feature>.dto.ts            # Create/Update/Response DTO
├── <feature>.mapper.ts         # AutomapperProfile (Entity <-> Dto)
├── <feature>.exception.ts      # extends AppException
├── <feature>.validation.ts     # mã lỗi + message riêng của module
├── <feature>.controller.spec.ts
└── <feature>.service.spec.ts
```

Không có `BaseRepository`/generic CRUD service — mỗi service tự `@InjectRepository(Entity)`. Copy nguyên folder `example/`, đổi tên, sửa field theo domain thật.

## Base entity

Mọi entity kế thừa `Base` (`src/app/base.entity.ts`): `id` (uuid PK), `slug` (unique, **tự sinh** bởi `AppSubscriber` nếu không set thủ công — chỉ cần `repository.create(data)` rồi `save`), `createdAt`/`updatedAt` (`@AutoMap()`), `deletedAt` (soft-delete), `createdBy`.

**`VersionedBase` (`src/app/versioned.entity.ts`, extends `Base`)** — thêm cột `version` (`@VersionColumn()`, TypeORM tự tăng mỗi lần `save()`), **chỉ dùng cho phiếu nhập/xuất/kiểm kho** (import/export/balance form). Mọi danh mục/master data — `Warehouse`, `Store`, `Unit`, `MaterialType`, `Material` — kế thừa `Base` (đã bỏ `version_column` ở migration `1783728000024`): PATCH/PUT không nhận `version`, 2 người sửa cùng lúc thì người sau thắng. `Example` vẫn giữ `VersionedBase` làm mẫu cho module phiếu. Quyết định `Base` hay `VersionedBase` chốt ngay lúc viết spec (mục "Entity / dữ liệu" trong `docs/specs/_TEMPLATE.md`), không tự thêm sau khi đã code xong.

Khi dùng `VersionedBase`:
- `Update<X>RequestDto` thêm field `version: number` (`@IsNotEmpty() @IsInt() @Min(1)`) — client phải gửi lại `version` nhận được từ lần `GET` gần nhất. **`@Min(1)` là bắt buộc, không phải trang trí:** TypeORM bọc cả khối so sánh version của optimistic lock trong `if (result && lockMode === 'optimistic' && lockVersion)` (`SelectQueryBuilder.js:691-693`) — `0` là falsy nên client gửi `version: 0` khiến check **không chạy** và `save()` ghi đè vô điều kiện, chỉ với 1 request (không cần race). `@IsNotEmpty` lẫn `@IsInt` đều cho `0` đi qua. Khi viết module phiếu, thêm test khoá hành vi này ở `<module>.dto.spec.ts` (mẫu: `src/example/example.dto.spec.ts`).
- `<X>ResponseDto` kế thừa `VersionedResponseDto` (`src/app/base.dto.ts`) thay vì `BaseResponseDto`.
- Trong `<module>.service.ts`, `update...()` load entity bằng `repository.findOne({ where: { slug }, lock: { mode: 'optimistic', version: dto.version } })` — TypeORM tự throw `OptimisticLockVersionMismatchError` nếu `version` không khớp bản mới nhất trong DB; lỗi này được `OptimisticLockExceptionFilter` (`src/app/optimistic-lock.filter.ts`, đã đăng ký global qua `APP_FILTER`) bắt và trả `DATA_VERSION_CONFLICT` (409) tự động — **không** tự try/catch trong service. Xem `src/example/example.service.ts` (`updateExample`) làm mẫu.
- `<module>.mapper.ts`: `createMap(mapper, Entity, ResponseDto, extend(baseMapper(mapper)), versionedMapper())` — `versionedMapper()` (`src/app/versioned.mapper.ts`) map riêng field `version`, dùng kèm chứ không thay thế `extend(baseMapper(mapper))`. Xem `src/example/example.mapper.ts` làm mẫu.

## Validation (DTO)

**Không có `ValidationPipe` global** — phải khai báo ở từng param:
```ts
async create(@Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CreateXRequestDto) { ... }
```
Đặt tên: `Create<X>RequestDto`, `Update<X>RequestDto`, `<X>ResponseDto` (extends `BaseResponseDto`, hoặc `VersionedResponseDto` nếu entity dùng `VersionedBase` — xem mục "Base entity"). Mỗi field: `@AutoMap()` + `@ApiProperty()` + class-validator.

### PATCH là partial update (bắt buộc, đúng nghĩa REST)

`PATCH` chỉ nhận field cần đổi; field không gửi **giữ nguyên giá trị cũ**. `PUT` mới là thay toàn bộ (hiện chỉ có `PUT /warehouses/:slug/manager` và `PUT /stores/:slug/warehouse`, cả hai thay đúng 1 slot quan hệ). 3 việc phải làm đủ, thiếu 1 là hỏng âm thầm:

1. **DTO**: `export class Update<X>RequestDto extends PartialType(Create<X>RequestDto)` (`PartialType` của `@nestjs/swagger`) — nó gắn `@IsOptional()` lên mọi field thừa hưởng, validator vẫn chạy khi field CÓ mặt. Nếu entity dùng `VersionedBase` thì `version` khai riêng trong lớp con và vẫn bắt buộc.
2. **Huỷ property initializer thừa hưởng**: `PartialType` sao chép cả `isActive?: boolean = true` / `minimumInventory?: number = 0` của DTO cha ⇒ PATCH không gửi field đó sẽ **âm thầm ghi giá trị mặc định đè lên bản ghi** (bật lại kho/cửa hàng đã tắt, reset ngưỡng tồn về 0). Khai lại field trong lớp con **kèm nguyên bộ decorator** (thiếu `@AutoMap()` là automapper bỏ luôn field, không map gì cả) và gán `= undefined`.
3. **Service**: `const data = pickDefined(this.mapper.map(dto, Update<X>RequestDto, <X>))` (`src/shared/utils/obj.util.ts`) trước khi `Object.assign(entity, data)`; mọi check trùng phải thêm rào `data.field !== undefined` — thiếu rào thì `assertCodeIsFree(undefined)` tra nhầm sang bản ghi khác. Field cần resolve quan hệ (`typeSlug` → entity) chỉ resolve khi client CÓ gửi.

Nếu mapper có `mapFrom((s) => s.field ?? <default>)` thì phải tách map của Create và Update: Create giữ default, Update để `undefined` chảy qua cho `pickDefined` lọc (xem `material.mapper.ts`: `inventoryDefaults()` vs `inventoryPassthrough()`).

`null` được coi như "không gửi" (`pickDefined` lọc cả `undefined` lẫn `null`) — hiện **chưa có** cách xoá 1 field optional về NULL qua PATCH. Ngoại lệ có chủ ý: `warehouse-material` dùng `null` nghĩa là "bỏ override, quay về ngưỡng của Material" và tự xử lý riêng, không đi qua `pickDefined`.

Test khoá 3 điểm trên nằm ở `<module>.dto.spec.ts` (body rỗng phải hợp lệ; initializer đã bị huỷ) và `<module>.service.spec.ts` (`describe('update<X> — partial (PATCH)')`).

**Quan trọng — message class-validator phải trùng KEY trong `<module>.validation.ts`** (vd `@IsNotEmpty({ message: 'EXAMPLE_NAME_IS_REQUIRED' })` phải khớp key đã khai báo), không phải câu văn tự do — `HttpExceptionFilter` tra `AppValidation[message]` để map ra `statusCode: 422` + mã lỗi chuẩn. Không khớp → trả nguyên message thô với statusCode 400 mặc định.

Query phân trang kế thừa `BaseQueryDto` (`page`, `size`, `sort: string[]`).

## Response chuẩn (bắt buộc, controller tự build — không có interceptor tự wrap)

```ts
{ statusCode, timestamp, method, path, result, message } // AppResponseDto<T>
```
Danh sách phân trang: `AppPaginatedResponseDto<T>` lồng vào `result` (`{ total, page, pageSize, items, hasPrevios, hasNext, totalPages }`).

## Exception & mã lỗi

- Global filter `src/app/http-exception.filter.ts` trả `{ statusCode, timestamp, path, method, message }`.
- Mọi exception nghiệp vụ kế thừa `AppException` (`src/app/app.exception.ts`); mỗi module tự định nghĩa `<module>.exception.ts` + dải mã lỗi riêng trong `<module>.validation.ts` (có guard chống trùng mã, throw lúc khởi động nếu trùng).

## Automapper (Entity <-> Dto)

Mỗi module có `<module>.mapper.ts` (1 `AutomapperProfile`, đăng ký làm provider trong module). Khi map Entity → ResponseDto, luôn truyền `extend(baseMapper(mapper))` (`src/app/base.mapper.ts`) làm tham số của `createMap` — `baseMapper()` đăng ký 1 lần map chung `Base -> BaseResponseDto` (convert `createdAt`/`updatedAt` từ `Date` sang `string`), mỗi module `extend` lại thay vì tự khai `typeConverter` riêng (theo đúng pattern `order-api` đang dùng, xem `src/app/base.mapper.ts` của `order-api` làm tham chiếu nếu cần đối chiếu). **`BaseResponseDto` (`src/app/base.dto.ts`) chỉ có `slug`/`createdAt`/`updatedAt`, cố tình không có `id`** — response không bao giờ lộ `id` (uuid PK) thật ra ngoài, `slug` là định danh public duy nhất; `id` trên entity (`src/app/base.entity.ts`) vẫn giữ (không còn `@AutoMap()`) để dùng nội bộ (join, FK).

## Guard & decorator xác thực/phân quyền (global, đã đăng ký sẵn qua `APP_GUARD`)

Thứ tự: `JwtOptionalAuthGuard` → `AuthorityGuard` → `HasRoleGuard` → `ThrottlerGuard` → `FeatureGuard`.

Có **2 cơ chế phân quyền chạy song song**, độc lập nhau (gắn cả 2 trên 1 endpoint là AND — phải qua cả hai):

1. **Authority động** (`@RequireAuthority`) — bảng `Role`/`Authority`/`AuthorityGroup`/`Permission`, admin bật/tắt lúc chạy, xem `docs/specs/authority-permission.md`. **Mặc định cho MỌI endpoint** — toàn bộ controller nghiệp vụ (`user`/`warehouse`/`material-type`/`unit`/`material`/`warehouse-material`/`store`/`tax-profile`) lẫn hạ tầng (`example`/`role`/`authority`/`permission`/`logger`/`db`) đều dùng nó.
2. **RBAC cơ bản theo role tĩnh** (`@HasRole`) — decorator/guard **vẫn giữ và vẫn đăng ký** nhưng **hiện không endpoint nào dùng**. Đừng gắn nó cho endpoint mới; dùng `@RequireAuthority` + migration seed.

Decorator:

- `@Public()` — bỏ qua yêu cầu JWT, không check gì.
- Không gắn gì — yêu cầu JWT hợp lệ, không check quyền cụ thể (mọi role đã login đều gọi được).
- `@RequireAuthority(AuthorityCode.X[, AuthorityCode.Y...])` (`src/authority/authority.decorator.ts`, hằng trong `src/authority/authority.constants.ts`) — yêu cầu JWT hợp lệ **và** role của user phải được cấp **tất cả** `code` đã khai trong `permission_tbl` (admin bật/tắt qua `PUT/DELETE /roles/:roleSlug/authorities/:authorityCode`). `SUPER_ADMIN` bypass toàn bộ check này.
- **Không có API tạo/xoá `Authority`/`AuthorityGroup`** — cố tình, để buộc đi qua migration (xem `docs/WORKFLOW.md` bước 6). **Mỗi feature mới = 1 migration seed authority riêng** (chỉ bộ CRUD `<FEATURE>_CREATE`/`_READ`/`_UPDATE`/`_DELETE`; thao tác nối sang tài nguyên khác thì kết hợp code sẵn có bằng `@RequireAuthority(A, B)`, không đẻ code mới), viết trong cùng lần đổi code: thêm hằng vào `AuthorityCode` (giữ nguyên hằng cũ, ghi chú migration seed nó), rồi migration khai mảng `AuthoritySeed[]` (`code`/`name`/`group`/`defaultRoles`) và gọi `seedAuthorities()`/`unseedAuthorities()` trong `src/authority/authority-seed.util.ts` (mẫu: `1783728000024-seed-unit-authorities.ts`). Helper nằm ngoài `src/migrations/` vì glob migration nạp mọi export ở đó. `Authority.code` là khoá tra cứu ổn định, tách riêng với `slug` (được phép đổi qua `PATCH /authorities/:slug`, chỉ đổi `name`/nhóm hiển thị).
- `@HasRole(RoleEnum.Admin, RoleEnum.Manager)` (`src/role/role.decorator.ts`, guard `HasRoleGuard` trong `src/role/role.guard.ts`) — **giữ lại nhưng không dùng**. Yêu cầu JWT hợp lệ **và** `roleName` (claim `role`) nằm trong danh sách khai ở decorator; không đọc DB/Redis, không cần migration. `SUPER_ADMIN` bypass; token không có claim `role` bị chặn (fail-closed).
- `hasRole(user, RoleEnum.Admin)` (cùng file) — bản hàm, chỉ dùng trong service cho rào **phụ thuộc dữ liệu** mà guard không biết được (vd chỉ `SUPER_ADMIN` được đụng tài khoản `SUPER_ADMIN` khác). Rào tĩnh theo endpoint thì dùng decorator, đừng tự check trong service.
- `@CurrentUser()` — lấy `CurrentUserDto { userId, userName, roleName, sessionId, scope }` (`sessionId` = claim `sid`, có thể `undefined` với token phát trước khi có claim này), `scope: string[]` là danh sách `Authority.code` role hiện có (cache Redis `rbac:user:{userId}`, xem `docs/specs/rbac.md`) — quyền admin bật/tắt qua API có hiệu lực ngay từ request tiếp theo, không cần user re-login. **Nhưng** migration seed authority ghi thẳng DB, không xoá cache: sau `typeorm:r` phải xoá key `rbac:*` (hoặc chờ hết TTL), không thì user đang có cache bị 403 ở endpoint mới.
- `@Feature('group:feature:child')` — bật/tắt theo feature flag (khác authority: dùng cho bật/tắt tính năng, không phải phân quyền theo role).
- `RoleBasedSerializationInterceptor` (global): ẩn/hiện field response theo role qua `@Expose({ groups: [RoleEnum.Admin] })` trên Response DTO — vẫn dựa vào `RoleEnum`/`roleName`, không liên quan tới `@RequireAuthority`.

### Map endpoint → authority (quyền cấp sẵn lúc seed)

Feature mới chỉ có CRUD (`<X>_CREATE`/`_READ`/`_UPDATE`/`_DELETE`). Route nối 2 tài nguyên **không** có authority riêng mà gắn `@RequireAuthority(A, B)` — nhiều code là **AND** (metadata luôn là mảng). Loại vật tư dùng chung `MATERIAL_*` với vật tư.

| Endpoint | Authority (AND) | Cấp sẵn cho |
|---|---|---|
| `POST /users` / `GET /users` | `USER_CREATE` / `USER_READ` | `ADMIN` |
| `POST /users/{userSlug}/change-password` | `USER_CHANGE_PASSWORD` | `ADMIN`, `MANAGER` |
| `POST` / `PATCH` / `DELETE /warehouses...` / `PUT .../manager` | `WAREHOUSE_CREATE` / `_UPDATE` / `_DELETE` / `_ASSIGN_MANAGER` | `ADMIN` |
| `GET /warehouses`, `GET /warehouses/{slug}` | `WAREHOUSE_READ` | `ADMIN`, `MANAGER`, `SUPERVISOR` |
| `GET /warehouses/mine` | — (mọi user đã đăng nhập, service tự lọc theo `userId`) | |
| `POST` / `GET` / `PATCH` / `DELETE /material-types...` và `/materials/{slug}` | `MATERIAL_CREATE` / `_READ` / `_UPDATE` / `_DELETE` | `ADMIN` (READ: `ADMIN`, `MANAGER`, `SUPERVISOR`) |
| `GET /materials/{slug}/conversion-units...`, `POST /materials/{slug}/convert` | `MATERIAL_READ` + `UNIT_READ` | `ADMIN`, `MANAGER`, `SUPERVISOR` |
| `POST` / `PATCH` / `DELETE /materials/{slug}/conversion-units...` | `MATERIAL_UPDATE` + `UNIT_UPDATE` | `ADMIN` |
| `POST` / `GET` / `PATCH` / `DELETE /units...` | `UNIT_CREATE` / `_READ` / `_UPDATE` / `_DELETE` | `ADMIN` (READ: `ADMIN`, `MANAGER`, `SUPERVISOR`) |
| `GET /warehouses/{slug}/materials` | `MATERIAL_READ` + `WAREHOUSE_READ` | `ADMIN`, `MANAGER`, `SUPERVISOR` |
| `POST` / `PATCH` / `DELETE /warehouses/{slug}/materials...` (kể cả `.../quantity`) | `MATERIAL_UPDATE` + `WAREHOUSE_UPDATE` | `ADMIN` |
| `POST` / `GET` / `PATCH` / `DELETE /stores...` | `STORE_CREATE` / `_READ` / `_UPDATE` / `_DELETE` | `ADMIN` (READ: `ADMIN`, `MANAGER`, `SUPERVISOR`) |
| `PUT /stores/{slug}/warehouse` | `STORE_UPDATE` + `WAREHOUSE_UPDATE` | `ADMIN` |
| `GET /tax-profiles...` / `POST /tax-profiles/{taxCode}/refresh` | `TAX_PROFILE_READ` / `TAX_PROFILE_UPDATE` | `ADMIN`, `MANAGER`, `SUPERVISOR` / `ADMIN` |

`SUPER_ADMIN` bypass tất cả. Cột "Cấp sẵn cho" chỉ là giá trị seed (migration `1783728000010`/`011`/`014`/`024`–`027`), khớp đúng `@HasRole` cũ; sau khi migrate nguồn sự thật là `permission_tbl`. Có test khoá metadata `@RequireAuthority` trong `<module>.controller.spec.ts` của từng module — gỡ/đổi nhầm decorator là test đỏ.

## Swagger convention

```ts
@ApiTags('Example')
@ApiBearerAuth()
@Controller('examples')
export class ExampleController {
  @ApiOperation({ summary: '...' })
  @ApiResponseWithType({ status: 201, description: '...', type: ExampleResponseDto })  // decorator tự viết, luôn dùng thay @ApiResponse thô
}
```

## Auth flow hiện có (`src/auth/`)

Đăng nhập bằng `phonenumber` + `password` (JWT), **chưa có** OTP, quên mật khẩu (reset khi không nhớ mật khẩu cũ), validate định dạng số điện thoại, ràng buộc độ mạnh mật khẩu. Đổi mật khẩu **đã có** (`POST /auth/change-password` cho chính mình, `POST /users/{userSlug}/change-password` cho admin/manager đổi hộ). **Không có đăng ký công khai** (`POST /auth/register` đã bỏ) — tài khoản chỉ được cấp phát cho user mới (chưa có API cấp phát, hiện phải insert thủ công qua migration/DB).

- `POST /auth/login`, `POST /auth/refresh` (cả 2 `@Public()`), `GET /auth/me`, `POST /auth/logout`, `POST /auth/logout-all`, `POST /auth/change-password` (4 cái sau cần JWT). Prefix đầy đủ: `/api/{VERSION}/...`.
- Đổi mật khẩu tách làm **2 endpoint ở 2 module khác nhau, quyền tĩnh khai ngay trên decorator** (không còn nhánh phân quyền theo body):
  - `POST /auth/change-password` (`AuthController` → `AuthService.changeOwnPassword`) — **tự đổi mật khẩu của chính mình**, mọi user đã đăng nhập đều gọi được (không gắn decorator quyền), body bắt buộc `currentPassword` + `newPassword`, trả `result.tokens` là cặp token mới (`sid` mới) để không bị văng khỏi app. Không nhận `userSlug`.
  - `POST /users/{userSlug}/change-password` (`UserController` → `UserService.changeUserPassword`, xem mục "Đổi mật khẩu hộ user khác" bên dưới) — **đổi hộ user khác**, gắn `@RequireAuthority(AuthorityCode.UserChangePassword)` (`SUPER_ADMIN` bypass), body chỉ có `newPassword`, trả `{ userSlug }`.
- Access token và refresh token ký cùng `JWT_SECRET`, phân biệt bằng claim `type` (`TokenType` trong `auth.dto.ts`): `JwtStrategy` từ chối refresh token dùng như access token, `AuthService.refresh()` từ chối access token gửi vào `/auth/refresh`. `jti` của 2 loại **khác nhau**; claim `sid` (session id) thì **giống nhau** và không đổi khi `/auth/refresh` ký lại token — `sid` mới là thứ dùng để thu hồi, không phải `jti`.
- Sai mật khẩu và không tìm thấy user đều trả `INVALID_CREDENTIALS` (không phân biệt).
- Role được seed sẵn qua migration (`SUPERVISOR`/`MANAGER`/`ADMIN`/`SUPER_ADMIN`); tài khoản admin đầu tiên tự tạo bởi `RootUserSeeder` (`ROOT_PHONENUMBER`/`ROOT_PASSWORD` trong `.env`, mặc định `root`/`root`) — dùng để test route giới hạn bởi `@RequireAuthority(...)` mà không cần thao tác SQL.
- Đổi role user khác: chưa có endpoint, phải update thủ công cột `role_id_column` trong DB.

### Đổi mật khẩu hộ user khác (`src/user/`)

`POST /users/{userSlug}/change-password` nằm ở **`UserController`/`UserService`** chứ không phải module auth: nó là thao tác quản trị trên tài khoản người khác, mã lỗi dùng dải `UserValidation` (`1004xx`), DTO `ChangeUserPassword*` nằm trong `user.dto.ts`. Chỉ luồng **tự đổi** (`/auth/change-password`) mới ở lại `src/auth/`.

- `UserService` cần `TokenRevocationService` để thu hồi phiên của user bị đổi. Vì `AuthModule` đã import `UserModule`, import ngược lại sẽ thành vòng tròn — nên service này được tách ra **`TokenRevocationModule`** (`src/auth/token-revocation.module.ts`, không import gì vì `RedisModule`/`ConfigModule` đều `@Global()`), cả `AuthModule` lẫn `UserModule` cùng import. Cần Redis ở module khác thì import module này, đừng khai `TokenRevocationService` làm provider riêng (2 instance) và đừng dùng `forwardRef`.
- `UserService.changeUserPassword` chỉ còn 2 rào **phụ thuộc dữ liệu** mà `AuthorityGuard` không biết được: trỏ `userSlug` vào **chính mình** → `CHANGE_OWN_PASSWORD_NOT_ALLOWED` (endpoint này không hỏi mật khẩu cũ, cho phép là mở đường cho token bị đánh cắp của admin đổi mật khẩu chính tài khoản đó), và người không phải `SUPER_ADMIN` đổi mật khẩu của một `SUPER_ADMIN` → `CHANGE_PASSWORD_FORBIDDEN`. Check role của người gọi thì đã do decorator lo.

### Thu hồi token — deny-list trên Redis

`TokenRevocationService` (`src/auth/token-revocation.service.ts`) là nơi duy nhất chạm Redis của auth. Mô hình **deny-list**: `login`/`refresh` **không ghi gì**, chỉ khi thu hồi mới ghi. Chi tiết + đánh đổi: `docs/specs/token-revocation.md`.

2 loại key (DB logic riêng, `REDIS_AUTH_DB`, tách khỏi DB của BullMQ), TTL của cả hai đều là `REFRESHABLE_DURATION`:

| Key | Value | Ghi khi |
|---|---|---|
| `BLACK_LIST_{uid}_{sid}` | `"1"` | `POST /auth/logout` |
| `TOKEN_IAT_AVAILABLE_{uid}` | mốc epoch giây | `POST /auth/logout-all`, cả 2 endpoint đổi mật khẩu (`/auth/change-password`, `/users/{userSlug}/change-password`) (sau này: xoá tài khoản) |

`logout-all` ghi **cả 2 key**: cutoff cho mọi thiết bị, cộng `BLACK_LIST` cho chính phiên đang gọi — vì `iat` chỉ có độ phân giải 1 giây nên token ký cùng giây với lần thu hồi sẽ lọt qua cutoff, và token đó chính là token của người vừa bấm nút.

Check thu hồi chạy ở **cả 2 đầu** — `JwtStrategy.validate` (access token) và `AuthService.refresh` (refresh token) — bằng **1 round-trip** `MGET`. Từ chối khi key blacklist tồn tại **hoặc** `payload.iat < cutoff`. Vì vậy `logout`/`logout-all`/`change-password` có hiệu lực **ngay ở request kế tiếp**, kể cả với access token còn hạn.

Đổi mật khẩu thu hồi theo đúng user **bị đổi mật khẩu**, không phải người gọi: `/auth/change-password` (tự đổi) giết mọi thiết bị của chính mình (kèm `BLACK_LIST` cho phiên đang gọi, bịt khe hở 1 giây giống `logout-all`) và trả về cặp token mới mang `sid` mới để không bị văng khỏi app; `/users/{userSlug}/change-password` chỉ thu hồi phiên của user bị đổi, token của người gọi không bị đụng. Thứ tự bắt buộc: **thu hồi trước, ký token mới sau** — ngược lại thì token vừa phát có thể rơi vào giây trước cutoff và chết ngay.

Bất biến khi sửa vùng này:
- **Fail-closed**: `isRevoked()` không đọc được Redis ⇒ từ chối request. Thu hồi mà bypass được bằng cách làm Redis chết thì không phải cơ chế bảo mật. Ngược với cache RBAC (fail-open, vì còn DB để đọc lại) — đừng copy nhầm hướng xử lý lỗi giữa 2 chỗ.
- Ghi thu hồi (`revokeSession`/`revokeAllTokensForUser`) **throw khi Redis lỗi**, không nuốt.
- TTL cả 2 key ≥ `REFRESHABLE_DURATION`, nếu không token cũ **sống lại** khi key hết hạn.
- `/auth/refresh` **không được ghi Redis** — thêm lệnh ghi vào đây là quay lại mô hình allow-list cũ.
- `sid` phải **giữ nguyên** qua mỗi lần refresh, nếu không logout bằng `sid` cũ không giết được token mới.
- Redis phải là `maxmemory-policy noeviction`, nếu không key thu hồi bị evict = user đã logout dùng lại được token.

Đã bỏ có chủ ý (đừng tưởng còn): rotation + cửa sổ grace, reuse detection, `MAX_ACTIVE_SESSIONS`, trần `REFRESH_TOKEN_ABSOLUTE_DURATION`, `GET /auth/sessions`. Refresh token cũ **không** chết khi refresh — nó sống tới `exp` của chính nó.

## Checklist khi tạo feature mới

1. Copy `src/example/`, đổi tên `Example` → `<Feature>`.
2. Entity kế thừa `Base` hoặc `VersionedBase` (quyết định theo spec, xem mục "Base entity" ở trên); DTO đủ `@AutoMap()` + `@ApiProperty()` + class-validator (message = key trong `*.validation.ts`).
3. `<module>.mapper.ts`: `createMap(mapper, Entity, ResponseDto, extend(baseMapper(mapper)))` khi map Entity → ResponseDto, thêm `versionedMapper()` vào cuối nếu entity dùng `VersionedBase` (xem mục "Automapper"/"Base entity" ở trên).
4. `<module>.exception.ts` (extends `AppException`) + `<module>.validation.ts` (dải mã lỗi chưa dùng — kiểm tra file khác để tránh trùng).
5. Controller: `ValidationPipe({ transform: true, whitelist: true })` cho từng `@Body`/`@Query`; response theo `AppResponseDto`/`AppPaginatedResponseDto`; `@ApiTags`/`@ApiBearerAuth`/`@ApiResponseWithType`.
6. Gắn `@Public()`/`@RequireAuthority(AuthorityCode.X)`/`@Feature()` nếu cần giới hạn truy cập — **không dùng `@HasRole`**. Feature mới luôn kèm: hằng `<Feature>Create/Read/Update/Delete` (chỉ CRUD) trong `AuthorityCode` và **1 migration seed riêng** gọi `seedAuthorities()`/`unseedAuthorities()` (xem mục "Guard & decorator" ở trên và `docs/WORKFLOW.md` bước 6) — không tách làm sau. Thêm test khoá metadata `REQUIRE_AUTHORITY_KEY` trong `<feature>.controller.spec.ts`.
7. Đăng ký trong `<module>.module.ts`, rồi thêm vào `src/app/app.module.ts` (imports) và `src/app/app.validation.ts` (gộp `<Feature>Validation`).
8. Sinh + chạy migration: `npm run typeorm:g --name=create-<feature>-table` rồi `npm run typeorm:r` (kèm migration seed `Authority` của bước 6).

## Đơn vị tính của vật tư (`unit` + bảng join `material_unit_can_have_tbl`)

**Đơn vị cơ sở KHÔNG phải khái niệm tách rời**: nó là MỘT DÒNG của `material_unit_can_have_tbl` với `conversionRate = 1`, còn `material_tbl.base_unit_id_column` chỉ là con trỏ chỉ ra dòng nào. Ràng buộc dưới DB là **FK TỔ HỢP** `(id, base_unit_id) -> (material_id, unit_id)` (migration `1783728000022`), không phải FK trỏ thẳng sang `unit_tbl`. TypeORM không khai được FK tổ hợp nên `Material.baseUnit` vẫn là `@ManyToOne` 1 cột — **đừng suy ra ràng buộc thật từ metadata entity**, nó nằm ở migration.

FK tổ hợp đó cho sẵn 4 thứ, không cần service gác: base unit chắc chắn là đơn vị của chính vật tư đó; mỗi vật tư đúng 1 base unit; `ON DELETE RESTRICT` chặn gỡ dòng join đang làm base; và phiếu nhập/xuất sau này chỉ cần FK tổ hợp `(material_id, unit_id)` vào cùng bảng là DB tự chặn ghi phiếu bằng đơn vị không thuộc vật tư.

- **Thứ tự ghi là bắt buộc** (FK tổ hợp): tạo dòng join TRƯỚC → trỏ `base_unit_id` SAU → xoá dòng join cũ CUỐI CÙNG. `createMaterial`/`updateMaterial` vì vậy chạy trong `TransactionManagerService` (`MaterialModule` import `DbModule`). Có test khoá thứ tự này trong `material.service.spec.ts`.
- `MaterialUnit` (`src/material/material-unit.entity.ts`) KHÔNG kế thừa `Base`: PK tổ hợp, không `slug`, không soft-delete ⇒ `DELETE` là xoá cứng, `PATCH` không có optimistic lock (không có cột `version`, body không nhận `version`).
- 4 rào ở `MaterialService` mà DB không biểu diễn được: phải có base unit trước khi gắn đơn vị quy đổi (`MATERIAL_BASE_UNIT_IS_REQUIRED`); tỉ lệ của dòng base luôn = 1, không cho sửa (`MATERIAL_BASE_UNIT_RATE_IS_FIXED`); không gỡ dòng base qua API (`MATERIAL_BASE_UNIT_CANNOT_BE_DETACHED` — DB cũng RESTRICT nhưng nó ném lỗi SQL thô thành 500); **đổi base unit bị khoá khi vật tư đã có tồn hoặc đã gắn đơn vị khác** (`MATERIAL_BASE_UNIT_LOCKED`) vì đổi base = đổi nghĩa mọi tỉ lệ đã lưu và mọi con số tồn kho.
- `GET .../conversion-units` trả danh sách ĐÃ GẮN (gồm cả dòng base, có cờ `isBaseUnit`); `GET .../conversion-units/available` trả unit chưa gắn. Cả hai dùng `UnitService.findAll(query, excludedUnitIds)`, đừng viết hàm list thứ hai cho unit.
- `POST /materials/{slug}/convert` là **thao tác đọc** (không ghi gì) nên gắn quyền nhóm ĐỌC dù là POST. Công thức: `toQuantity = (fromQuantity × rate(from)) ÷ rate(to)`, luôn đi vòng qua đơn vị cơ sở; kết quả làm tròn 6 chữ số thập phân. Service tự chặn `rate <= 0` đọc lên từ DB (bảng join ghi thẳng dưới DB được) để không trả `Infinity`/`NaN`.

## Số lượng là DECIMAL(18,6), không phải INT

Từ migration `1783728000021`: `warehouse_material_tbl.quantity_column`, `minimum/maximum_inventory_column` (cả `material_tbl` lẫn override theo kho) đều là `DECIMAL(18,6)` — cùng scale với `conversion_rate`. Lý do: nhập theo đơn vị nhỏ hơn đơn vị cơ sở luôn ra số lẻ (1 KG của vật tư base = BAO ⇒ 0.02 BAO), cột `int` cũ làm tròn về 0 và mất hàng im lặng.

- MySQL driver trả `DECIMAL` về dạng **string** ⇒ mọi cột DECIMAL phải gắn `decimalToNumber` (`src/shared/utils/decimal.transformer.ts`), không thì `quantity > 0` là so sánh chuỗi. Cùng file có `roundToScale()` — dùng nó thay vì `Math.round(x * 1e6) / 1e6`.
- DTO dùng `IsDecimalWithScale(6)` (`src/shared/utils/decimal.validator.ts`) chứ KHÔNG `@IsNumber({ maxDecimalPlaces })`: decorator có sẵn của class-validator **crash thành 500** với số dạng mũ (`(1e-7).toString()` không có dấu chấm ⇒ `undefined.length`).
- `adjustQuantity` vẫn là 1 câu UPDATE nguyên tử `quantity_column + (delta) >= 0`; `delta` đi qua `roundToScale(Number(...))` chứ **không** `Math.trunc` nữa (trunc sẽ nuốt lượng nhập lẻ).
- Tồn kho luôn tính theo **đơn vị cơ sở** của vật tư. Phiếu nhập/xuất sau này ghi đơn vị nào cũng phải quy về base trước khi cộng, và phải **snapshot `conversion_rate` vào dòng phiếu** — tỉ lệ trên `MaterialUnit` sửa được bất cứ lúc nào, join sang nó lúc đọc là viết lại quá khứ.

## Common/shared code

Không có `src/common`. `src/app/`: response DTO, exception/error-code base, `base.entity`/`base.dto`/`base.mapper`, `http-exception.filter`, swagger decorator, `env.validation`. `src/shared/`: hiện chỉ có `utils/`. `src/redis/`: `RedisModule` (`@Global()`) + `RedisService` bọc `ioredis` — client dùng chung cho mọi module cần Redis trực tiếp (BullMQ tự quản connection riêng của nó). Guard/decorator xác thực-phân quyền nằm ngay trong module sở hữu (`src/auth/`, `src/role/`, `src/feature-flag-system/`).

## Quy tắc khi tạo skill mới (`.claude/skills/`)

Mọi skill tạo trong `app/warehouse-api/.claude/skills/` (kể cả skill mới tạo sau này, không chỉ `verify-feature`) phải tự cải tiến theo kinh nghiệm sử dụng, không đứng yên như tài liệu tĩnh. Khi viết `SKILL.md` cho skill mới, luôn thêm 2 phần sau, không cần user nhắc lại:

1. 1 bước cuối trong danh sách các bước chính: *"nếu gặp case/lỗi mà các bước trên chưa đề cập, hỏi user trước (nêu rõ nội dung định thêm) — chỉ append vào mục 'Bài học rút ra' cuối file sau khi user đồng ý, không tự sửa khi chưa xác nhận, không sửa các bước đã có"*.
2. Mục `## Bài học rút ra` ở cuối file, khởi tạo rỗng với chú thích "chưa có bài học nào".

Mục đích: skill tự tích luỹ kinh nghiệm thực tế (case lạ, bẫy dễ sai) qua mỗi lần dùng, thay vì mỗi lần đều dựa hoàn toàn vào phần hướng dẫn viết sẵn ban đầu — nhưng **luôn cần user duyệt trước khi ghi**, không tự động append. User review định kỳ mục "Bài học rút ra", xoá bài học sai hoặc gộp vào phần hướng dẫn chính nếu đã đủ chín.

## Nợ kỹ thuật / việc chưa làm — đừng giả định đã có

- `.env` bắt buộc nhiều biến (Mail/ACB/Zalo OA/Google Maps/Firebase) mà **chưa module nào dùng thật** trong code — app vẫn crash lúc bootstrap nếu thiếu, phải điền giá trị dummy hợp lệ format.
- `ALLOWED_ORIGINS` không nằm trong `env.validation.ts` nhưng **bắt buộc thực tế** — thiếu sẽ crash bootstrap (`corsOptions()`).
- OTP, quên mật khẩu (reset khi không nhớ mật khẩu cũ), validate định dạng số điện thoại. **Không có ràng buộc độ mạnh mật khẩu** ở bất kỳ đâu (`login`/`POST /users`/2 endpoint đổi mật khẩu chỉ `@IsNotEmpty()`) — mật khẩu 1 ký tự vẫn qua.
- Phiếu nhập/xuất/kiểm kho, phiếu chi kho — `AuthorityCode` đã khai sẵn code cho chúng nhưng **chưa module nào tồn tại**. Tồn kho hiện chỉ sửa được bằng `PATCH /warehouses/{slug}/materials/{materialSlug}/quantity` (cửa TẠM, bỏ khi có phiếu).
- **`typeorm:g` KHÔNG dùng được trên repo này**: `migration:generate` diff cả schema cũ và đẻ ra lệnh drop/re-add `user_tbl.phonenumber_column`, `warehouse_tbl.code_column` (mất dữ liệu) + hạ cấp `ON DELETE` của loạt FK, vì migration cũ đặt tên index/FK thủ công và dùng VARCHAR hẹp hơn suy diễn từ entity. Viết tay migration (xem `1783728000015-create-material-tables.ts`), hoặc sinh ra rồi xoá sạch lệnh ngoài phạm vi trước khi chạy.
- `Material.baseUnit` (`base_unit_id_column`) là NULL-able và **không có cách gỡ về NULL qua PATCH** (`pickDefined` lọc cả `null`) — vật tư cũ tạo trước migration `1783728000020` vẫn chưa có đơn vị cơ sở, và chưa endpoint nào gán được tỉ lệ khi vật tư chưa khai base unit.
- **Chưa có phiếu nhập/xuất** nên chưa có chỗ nào snapshot `conversion_rate`: sửa tỉ lệ qua `PATCH .../conversion-units/{unitSlug}` hiện không ảnh hưởng lịch sử nào, nhưng viết phiếu mà quên snapshot là viết lại quá khứ.
- Không có `Dockerfile`/`docker-compose.yml` — MySQL/Redis phải tự cài/chạy.
- **Redis là thành phần BẮT BUỘC** (không còn tuỳ chọn): `REDIS_HOST`/`REDIS_PORT` đã nằm trong `env.validation.ts`, thiếu là app không boot; Redis chết là **mọi request có JWT đều 401** (check thu hồi token fail-closed) — nặng hơn trước, xem mục "Thu hồi token". `/health` đã có indicator Redis.
- `ROOT_PHONENUMBER`/`ROOT_PASSWORD`, `REDIS_PASSWORD`, `AWS_*` không nằm trong `env.validation.ts` — đọc thẳng bằng `configService.get`, không được validate.
- Không còn phát hiện refresh token bị đánh cắp (reuse detection đã bỏ cùng allow-list): token bị lộ dùng được tới khi hết hạn hoặc user logout.
- Chưa có endpoint xoá tài khoản / khoá-mở khoá (`isActive`) / đổi role user khác, dù primitive `TokenRevocationService.revokeAllTokensForUser()` đã sẵn sàng cho chúng. Đổi mật khẩu thì đã có (2 endpoint, xem mục "Auth flow").

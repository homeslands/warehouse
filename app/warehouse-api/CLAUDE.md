# warehouse-api

NestJS 10 + TypeORM/MySQL. `setup.md` trong thư mục này là ghi chú thủ công về các bước setup ban đầu (env, DB, chạy app lần đầu) — không phải tài liệu convention cho Claude, không cần đọc trừ khi cần setup môi trường từ đầu.

> `src/` hiện có: `app/`, `auth/`, `config/`, `db/`, `example/` (module mẫu), `feature-flag-system/`, `file/` (S3), `health/`, `logger/`, `migrations/`, `notification/firebase/`, `role/`, `shared/`, `user/`. Chưa có module nghiệp vụ warehouse thật (product/stock/inventory...) — tạo mới theo template `example/`.

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
├── <feature>.entity.ts         # extends Base, @Entity('<feature>_tbl')
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

## Validation (DTO)

**Không có `ValidationPipe` global** — phải khai báo ở từng param:
```ts
async create(@Body(new ValidationPipe({ transform: true, whitelist: true })) dto: CreateXRequestDto) { ... }
```
Đặt tên: `Create<X>RequestDto`, `Update<X>RequestDto`, `<X>ResponseDto` (extends `BaseResponseDto`). Mỗi field: `@AutoMap()` + `@ApiProperty()` + class-validator.

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

Thứ tự: `JwtOptionalAuthGuard` → `AuthorityGuard` → `ThrottlerGuard` → `FeatureGuard`.

Phân quyền theo **authority động** (bảng `Role`/`Authority`/`AuthorityGroup`/`Permission` trong `src/role/`), không hardcode role trong code — xem `docs/specs/authority-permission.md`:

- `@Public()` — bỏ qua yêu cầu JWT, không check gì.
- Không gắn gì — yêu cầu JWT hợp lệ, không check quyền cụ thể (mọi role đã login đều gọi được).
- `@RequireAuthority('SOME_CODE')` (`src/authority/authority.decorator.ts`) — yêu cầu JWT hợp lệ **và** role của user phải được cấp `SOME_CODE` đó trong `permission_tbl` (admin bật/tắt qua `PUT/DELETE /roles/:roleSlug/authorities/:authorityCode`). `SUPER_ADMIN` bypass toàn bộ check này.
- **Không có API tạo/xoá `Authority`/`AuthorityGroup`** — cố tình, để buộc đi qua migration (xem mục "Nợ kỹ thuật" và `docs/WORKFLOW.md` bước 6): mỗi lần gắn/đổi/xoá `@RequireAuthority(code)` trên 1 endpoint, phải viết kèm migration thêm/sửa/xoá `Authority` row có `code` tương ứng trong cùng lần đổi code. `Authority.code` là khoá tra cứu ổn định, tách riêng với `slug` (được phép đổi qua `PATCH /authorities/:slug`, chỉ đổi `name`/nhóm hiển thị).
- `@CurrentUser()` — lấy `CurrentUserDto { userId, userName, roleName, scope }`, `scope: string[]` là danh sách `Authority.code` role hiện có, tính lại từ DB mỗi request (không cache, không nằm trong JWT) — quyền admin bật/tắt có hiệu lực ngay từ request tiếp theo, không cần user re-login.
- `@Feature('group:feature:child')` — bật/tắt theo feature flag (khác authority: dùng cho bật/tắt tính năng, không phải phân quyền theo role).
- `RoleBasedSerializationInterceptor` (global): ẩn/hiện field response theo role qua `@Expose({ groups: [RoleEnum.Admin] })` trên Response DTO — vẫn dựa vào `RoleEnum`/`roleName`, không liên quan tới `@RequireAuthority`.

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

Đăng nhập bằng `phonenumber` + `password` (JWT), **chưa có** OTP, quên/đổi mật khẩu, refresh-token endpoint, validate định dạng số điện thoại. **Không có đăng ký công khai** (`POST /auth/register` đã bỏ) — tài khoản chỉ được cấp phát cho user mới (chưa có API cấp phát, hiện phải insert thủ công qua migration/DB).

- `POST /api/{VERSION}/auth/login`, `GET /api/{VERSION}/auth/me` (cần JWT).
- Sai mật khẩu và không tìm thấy user đều trả `INVALID_CREDENTIALS` (không phân biệt).
- Role được seed sẵn qua migration (`SUPERVISOR`/`MANAGER`/`ADMIN`/`SUPER_ADMIN`); tài khoản admin đầu tiên tự tạo bởi `RootUserSeeder` (`ROOT_PHONENUMBER`/`ROOT_PASSWORD` trong `.env`, mặc định `root`/`root`) — dùng để test route giới hạn bởi `@RequireAuthority(...)` mà không cần thao tác SQL.
- Đổi role user khác: chưa có endpoint, phải update thủ công cột `role_id_column` trong DB.

## Checklist khi tạo feature mới

1. Copy `src/example/`, đổi tên `Example` → `<Feature>`.
2. Entity kế thừa `Base`; DTO đủ `@AutoMap()` + `@ApiProperty()` + class-validator (message = key trong `*.validation.ts`).
3. `<module>.mapper.ts`: `createMap(mapper, Entity, ResponseDto, extend(baseMapper(mapper)))` khi map Entity → ResponseDto (xem mục "Automapper" ở trên).
4. `<module>.exception.ts` (extends `AppException`) + `<module>.validation.ts` (dải mã lỗi chưa dùng — kiểm tra file khác để tránh trùng).
5. Controller: `ValidationPipe({ transform: true, whitelist: true })` cho từng `@Body`/`@Query`; response theo `AppResponseDto`/`AppPaginatedResponseDto`; `@ApiTags`/`@ApiBearerAuth`/`@ApiResponseWithType`.
6. Gắn `@Public()`/`@RequireAuthority('SOME_CODE')`/`@Feature()` nếu cần giới hạn truy cập. Nếu dùng `@RequireAuthority(...)` với `code` chưa tồn tại, **bắt buộc** viết kèm migration seed `Authority` row đó (xem mục "Guard & decorator" ở trên và `docs/WORKFLOW.md` bước 6) — không tách làm sau.
7. Đăng ký trong `<module>.module.ts`, rồi thêm vào `src/app/app.module.ts` (imports) và `src/app/app.validation.ts` (gộp `<Feature>Validation`).
8. Sinh + chạy migration: `npm run typeorm:g --name=create-<feature>-table` rồi `npm run typeorm:r` (kèm migration seed `Authority` nếu bước 6 có dùng `@RequireAuthority` với code mới).

## Common/shared code

Không có `src/common`. `src/app/`: response DTO, exception/error-code base, `base.entity`/`base.dto`/`base.mapper`, `http-exception.filter`, swagger decorator, `env.validation`. `src/shared/`: constants, decorators, interfaces, redis, services dùng chung, utils. Guard/decorator xác thực-phân quyền nằm ngay trong module sở hữu (`src/auth/`, `src/role/`, `src/feature-flag-system/`).

## Quy tắc khi tạo skill mới (`.claude/skills/`)

Mọi skill tạo trong `app/warehouse-api/.claude/skills/` (kể cả skill mới tạo sau này, không chỉ `verify-feature`) phải tự cải tiến theo kinh nghiệm sử dụng, không đứng yên như tài liệu tĩnh. Khi viết `SKILL.md` cho skill mới, luôn thêm 2 phần sau, không cần user nhắc lại:

1. 1 bước cuối trong danh sách các bước chính: *"nếu gặp case/lỗi mà các bước trên chưa đề cập, hỏi user trước (nêu rõ nội dung định thêm) — chỉ append vào mục 'Bài học rút ra' cuối file sau khi user đồng ý, không tự sửa khi chưa xác nhận, không sửa các bước đã có"*.
2. Mục `## Bài học rút ra` ở cuối file, khởi tạo rỗng với chú thích "chưa có bài học nào".

Mục đích: skill tự tích luỹ kinh nghiệm thực tế (case lạ, bẫy dễ sai) qua mỗi lần dùng, thay vì mỗi lần đều dựa hoàn toàn vào phần hướng dẫn viết sẵn ban đầu — nhưng **luôn cần user duyệt trước khi ghi**, không tự động append. User review định kỳ mục "Bài học rút ra", xoá bài học sai hoặc gộp vào phần hướng dẫn chính nếu đã đủ chín.

## Nợ kỹ thuật / việc chưa làm — đừng giả định đã có

- `.env` bắt buộc nhiều biến (Mail/ACB/Zalo OA/Google Maps/Firebase) mà **chưa module nào dùng thật** trong code — app vẫn crash lúc bootstrap nếu thiếu, phải điền giá trị dummy hợp lệ format.
- `ALLOWED_ORIGINS` không nằm trong `env.validation.ts` nhưng **bắt buộc thực tế** — thiếu sẽ crash bootstrap (`corsOptions()`).
- OTP, quên/đổi mật khẩu, refresh-token endpoint, validate định dạng số điện thoại.
- Module nghiệp vụ warehouse thật (product/stock/inventory...) — hiện chỉ có `example/` làm template.
- Không có `Dockerfile`/`docker-compose.yml` — MySQL/Redis phải tự cài/chạy.

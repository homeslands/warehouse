# Setup

Tài liệu này liệt kê các bước setup ban đầu để bắt đầu phát triển **warehouse-api** (NestJS 10 + TypeORM/MySQL). Không đề cập tới UI, chỉ tập trung phần API.

> Hiện tại `src/` mới có: `app/`, `auth/`, `config/`, `db/`, `example/` (module mẫu), `feature-flag-system/`, `health/`, `logger/`, `migrations/`, `role/`, `shared/`, `user/`. Chưa có module nghiệp vụ warehouse thật nào (product/stock/inventory...) — tạo mới theo template `example/`.

## Yêu cầu hệ thống (Prerequisites)

- **Node.js**: `>=24` (khai báo trong `package.json#engines`, có `.nvmrc`).
- **MySQL** 8.x (driver `mysql2`, kết nối qua `src/config/database.config.ts`).
- **Redis**: `BullModule.forRootAsync` được đăng ký global trong `app.module.ts` (prefix `warehouse-bull`), nhưng **hiện chưa có module nghiệp vụ nào dùng BullMQ** — Redis không bắt buộc chạy để app start (kết nối lỗi chỉ log/retry, không throw), chỉ cần thiết khi có module thêm queue.
- Package manager: `npm` (có `package-lock.json`).

## Cài đặt dependencies

```bash
npm install
```

## Cấu hình biến môi trường

Copy `.env.example` (đã có sẵn ở root `warehouse-api`) thành `.env` và điền giá trị thật. `.env.example` không đồng bộ hoàn toàn với `env.validation.ts` — xem cảnh báo bên dưới. Ứng dụng sẽ **fail khi khởi động** nếu thiếu/sai bất kỳ biến nào được validate.

Các biến bắt buộc (validate bởi class-validator trong `src/app/env.validation.ts`):

| Nhóm | Biến |
|---|---|
| App | `NODE_ENV` (development/production/test/provision), `PORT`, `VERSION` |
| Database (MySQL) | `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `DATABASE_NAME` |
| Auth/JWT | `SALT_ROUNDS` (10-12), `DURATION`, `REFRESHABLE_DURATION`, `SESSION_SECRET`, `JWT_SECRET` |
| Mail (SMTP) | `MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` |
| Thanh toán ACB | `ACB_CLIENT_ID`, `ACB_CLIENT_SECRET` |
| Zalo OA | `ZALO_OA_API_KEY`, `ZALO_OA_SECRET_KEY`, `ZALO_OA_ID` |
| Google Maps | `GOOGLE_MAP_API_URL`, `GOOGLE_MAPS_API_KEY` |
| Firebase Admin | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| `ALLOWED_ORIGINS` | Không nằm trong `env.validation.ts` nhưng bắt buộc — xem cảnh báo dưới |

> ⚠️ **Nợ kỹ thuật chưa dọn**: `env.validation.ts` vẫn bắt buộc `MAIL_*`, `ACB_CLIENT_ID/SECRET`, `ZALO_OA_*`, `GOOGLE_MAP_API_URL`, `GOOGLE_MAPS_API_KEY`, `FIREBASE_*` — nhưng warehouse-api **không có module nào dùng các biến này** (không có `mail/`, `acb-connector/`, `zalo-oa-connector/`, `google-map/`, `firebase` trong `src/`). App vẫn **crash lúc bootstrap** nếu thiếu, dù không có tính năng nào thật sự cần. Tạm thời phải điền giá trị dummy hợp lệ format cho các biến này để app start được (xem template bên dưới); khi dọn dẹp, nên xoá các field này khỏi `EnvironmentVariables` một khi chắc chắn không cần.

> Biến `ROOT_PHONENUMBER`/`ROOT_PASSWORD` không nằm trong `env.validation.ts` (có default `root`/`root` nếu không set) — dùng bởi `RootUserSeeder` (`src/auth/root-user.seeder.ts`), xem mục "Khởi tạo database" bên dưới.

> `ALLOWED_ORIGINS` cũng không nằm trong `env.validation.ts` nhưng **thực tế bắt buộc phải set** — thiếu biến này app sẽ crash ngay lúc bootstrap (`corsOptions()` throw `Error` rõ ràng).

> Với các key sandbox (ACB, Zalo OA, Firebase, Google Maps, mail...) hiện không dùng thật, có thể dùng giá trị test/dummy hợp lệ format để app khởi động được ở local.

### Template `.env`

Nội dung thực tế đã có sẵn ở `.env.example` (root `warehouse-api`, không bị `.gitignore` chặn) — dưới đây là bản đối chiếu, giữ giá trị không nhạy cảm, thay giá trị nhạy cảm bằng placeholder. Lấy giá trị thật từ người quản lý credential của dự án.

```bash
DATABASE_USERNAME=root
DATABASE_PASSWORD=<mysql-password>
DATABASE_NAME=warehouse_db
DATABASE_HOST=localhost
DATABASE_PORT=3306

PORT=8081
NODE_ENV=development
VERSION=v1

SALT_ROUNDS=10
DURATION=3600
REFRESHABLE_DURATION=36000

# Root user (auto-seed khi app bootstrap nếu chưa tồn tại — xem RootUserSeeder)
ROOT_PHONENUMBER=root
ROOT_PASSWORD=root

SESSION_SECRET=<random-long-string>
JWT_SECRET=<random-long-string>
ALLOWED_ORIGINS="http://localhost:4200,http://localhost:5174"

# Mail (SMTP) — bắt buộc bởi env.validation.ts nhưng KHÔNG có module mail nào dùng thật, xem cảnh báo ở trên
MAIL_HOST=smtp.gmail.com
MAIL_USER=<gmail-address>
MAIL_PASSWORD=<gmail-app-password>
MAIL_FROM=<gmail-address>

# ACB payment sandbox — bắt buộc bởi env.validation.ts, KHÔNG có module acb-connector nào dùng thật
ACB_CLIENT_ID=<acb-sandbox-client-id>
ACB_CLIENT_SECRET=<acb-sandbox-client-secret>

# Zalo OA — bắt buộc bởi env.validation.ts, KHÔNG có module zalo-oa-connector nào dùng thật
ZALO_OA_API_KEY=<zalo-oa-api-key>
ZALO_OA_SECRET_KEY=<zalo-oa-secret-key>
ZALO_OA_ID=<zalo-oa-id>

# Google Maps — bắt buộc bởi env.validation.ts, KHÔNG có module google-map nào dùng thật
GOOGLE_MAP_API_URL=https://maps.googleapis.com/maps/api
GOOGLE_MAPS_API_KEY=<google-maps-api-key>

# Firebase Admin — bắt buộc bởi env.validation.ts, KHÔNG có module firebase nào dùng thật
FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_CLIENT_EMAIL=<firebase-client-email>
FIREBASE_PRIVATE_KEY="<firebase-private-key-with-\n-escaped>"

# Redis (BullMQ — tuỳ chọn thật sự, chưa có module nào dùng trong phạm vi hiện tại)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<redis-password>

# Proxy
TRUST_PROXY_COUNT=1
```

## Khởi tạo database

1. Tạo database MySQL rỗng theo tên trong `DATABASE_NAME` (mặc định `warehouse_db`).
2. Chạy migrations (không dùng `synchronize`, bắt buộc qua TypeORM CLI):

```bash
npm run typeorm:r
```

Migration hiện có trong `src/migrations/` (chạy theo thứ tự timestamp):
1. `create-authority-tables` — bảng authority/authority-group (phân quyền chi tiết).
2. `create-role-tables` — bảng `role_tbl` + bảng nối permission.
3. `create-user-table` — bảng `user_tbl`.
4. `create-example-table` — bảng của module mẫu `example/`.
5. `seed-roles` — **tự insert sẵn 3 role** `CUSTOMER`/`ADMIN`/`SUPER_ADMIN` vào `role_tbl` — không cần seed role thủ công.
6. `create-logger-table` — bảng log request (Winston `DatabaseTransport`).

3. Sau khi migrate xong, **khởi động app một lần** (`npm run dev`) — `RootUserSeeder` (`OnApplicationBootstrap`, đăng ký trong `AuthModule`) sẽ tự tạo 1 user với role `SUPER_ADMIN` nếu chưa tồn tại user có `phonenumber = ROOT_PHONENUMBER` (mặc định `root`/`root` nếu không set trong `.env`). Đây là cách để có tài khoản admin đầu tiên test `@HasRoles` mà không cần thao tác SQL thủ công.

Các lệnh migration khác:
- `npm run typeorm:g --name=<ten-migration>`: generate migration từ thay đổi entity.
- `npm run typeorm:c --name=<ten-migration>`: tạo migration rỗng.
- `npm run typeorm:rv`: revert migration gần nhất.

## Development mode

```bash
npm run dev          # nest start -w (watch mode)
npm run start:debug  # kèm debugger
```

- API prefix: `api/${VERSION}` (set trong `main.ts`, ví dụ `VERSION=v1` → route thực tế `api/v1/...`). Swagger UI **không** nằm trong prefix này.
- Swagger UI: `http://localhost:{PORT}/api/api-docs`. JSON document nằm ở root: `http://localhost:{PORT}/swagger.json` (do `jsonDocumentUrl: 'swagger.json'` không bật `useGlobalPrefix`, nên không nối thêm `api/api-docs`).
- CORS whitelist theo `ALLOWED_ORIGINS` (danh sách origin phân tách bằng dấu phẩy, xem `src/config/cors.config.ts`). **Lưu ý**: biến này *không* nằm trong `env.validation.ts` nhưng thực tế **bắt buộc phải có** — `corsOptions()` gọi `allowedOrigins.split(',')` ngay khi bootstrap, nếu thiếu `ALLOWED_ORIGINS` app sẽ **crash lúc khởi động** (TypeError, không phải lỗi validate rõ ràng).
- Static file: `ServeStaticModule` phục vụ thư mục `public/` ở root URL (không qua prefix `api/${VERSION}`).
- App test nhanh (không cần JWT, `@Public()`): `GET /hello`, `GET /real-ip`, `GET /error-codes` (liệt kê toàn bộ mã lỗi nghiệp vụ đang đăng ký trong `AppValidation`, hữu ích để tra cứu khi debug), `GET /health` (health check, gọi HTTP vào `/hello` — ẩn khỏi Swagger).

## Production mode

```bash
npm run build   # lint + nest build -> dist/
npm run start   # node dist/main
```

## Lint & format

```bash
npm run lint     # eslint --fix trên src, apps, libs, test
npm run format   # prettier --write src, test
```

## Testing

```bash
npm run test        # unit test (jest, rootDir ./src, *.spec.ts)
npm run test:watch
npm run test:cov
npm run test:e2e    # jest --config ./test/jest-e2e.json (*.e2e-spec.ts)
```

## Ghi chú hạ tầng khác

- Không có `Dockerfile`/`docker-compose.yml` trong dự án — MySQL, Redis phải cài/chạy thủ công (hoặc tự thiết lập container).
- Không phải monorepo (không nx/turborepo/lerna/pnpm-workspace) — `warehouse-api` là app độc lập, sibling với `warehouse-ui` (hiện trống) trong `app/`.
- `.ncurc.json` (`target: minor`): giới hạn gợi ý update dependency ở mức minor khi dùng `npm-check-updates`.
- **BullMQ**: `BullModule.forRootAsync` (`app.module.ts`) kết nối Redis qua `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`, `retryStrategy` dừng thử lại sau 10 lần, tất cả queue dùng chung `prefix: 'warehouse-bull'`. Hiện **chưa có module nghiệp vụ nào enqueue job** — Redis không bắt buộc để app khởi động.
- **`nestjs-cls`**: `ClsModule.forRoot({ global: true, middleware: { mount: true } })` — context theo từng request, không cần setup thêm gì.
- **Session** (`src/config/session.config.ts`): dùng `express-session` + `express-mysql-session` — **lưu session vào MySQL** (bảng `session_tbl`, tự tạo lúc app start nhờ `createDatabaseTable: true`, không qua migration TypeORM). Không có code Redis-session dự phòng. Cookie `maxAge` 1 ngày, `secure` bật khi `NODE_ENV=production`.
- **Root user seeder**: `RootUserSeeder` (`src/auth/root-user.seeder.ts`, `OnApplicationBootstrap`) — tự tạo user `SUPER_ADMIN` đầu tiên từ `ROOT_PHONENUMBER`/`ROOT_PASSWORD` nếu chưa tồn tại. Chạy mỗi lần app bootstrap nhưng no-op nếu user đã tồn tại.
- **Module chưa tồn tại nhưng được validate bắt buộc trong `.env`**: `mail/`, `acb-connector/`, `zalo-oa-connector/`, `google-map/`, Firebase Admin — xem cảnh báo ở mục "Cấu hình biến môi trường".
- **Health check**: `GET /health` (`src/health/`, dùng `@nestjs/terminus` + `@nestjs/axios`, `@Public()`, `@ApiExcludeController` nên không hiện trên Swagger) — dùng `HttpHealthIndicator.pingCheck(...)` gọi HTTP vào chính route `GET /api/${VERSION}/hello` của app (`http://localhost:${PORT}/api/${VERSION}/hello`), không ping DB trực tiếp. Cùng cách làm với `order-api`.

---

# Quy ước kiến trúc & boilerplate (bắt buộc nắm trước khi code feature)

Phần này mô tả các convention có sẵn trong dự án. Khi tạo feature mới, **tái sử dụng** đúng các pattern này thay vì tự tạo mới.

## 1. Cấu trúc 1 module mẫu

Mỗi feature là 1 folder trong `src/<feature>/`, tham khảo `src/example/` làm template (đã tồn tại thật trong code, đăng ký sẵn trong `app.module.ts`):

```
example/
├── example.controller.ts        # route, @ApiTags, ValidationPipe theo từng param
├── example.service.ts           # business logic, inject Repository<Entity> trực tiếp
├── example.module.ts            # TypeOrmModule.forFeature([Example]), khai báo controller/service/profile
├── example.entity.ts            # extends Base, @Entity('example_tbl')
├── example.dto.ts                # Create/Update/Response DTO
├── example.mapper.ts               # AutomapperProfile (Entity <-> Dto)
├── example.exception.ts             # extends AppException
├── example.validation.ts              # khai báo mã lỗi + message riêng của module
├── example.controller.spec.ts
└── example.service.spec.ts
```

Không có `BaseRepository`/generic CRUD service — mỗi service tự `@InjectRepository(Entity)`.

## 2. Base entity

Mọi entity kế thừa `Base` (`src/app/base.entity.ts`):
- `id` (uuid, PK)
- `slug` (unique)
- `createdAt`, `updatedAt` (có `@AutoMap()`)
- `deletedAt` (`@DeleteDateColumn`, soft-delete)
- `createdBy`

> **Tự động sinh `slug`**: `AppSubscriber` (`src/app/app.subscriber.ts`, TypeORM `@EventSubscriber`) hook `beforeInsert` toàn cục — nếu entity insert chưa có `slug` thì tự gán 1 chuỗi random (`getRandomString()`). Do đó **không cần tự set `slug` thủ công khi create** (service chỉ cần `repository.create(data)` rồi `save`, subscriber sẽ tự điền nếu thiếu).

```ts
@Entity('example_tbl')
export class Example extends Base {
  @AutoMap()
  @Column({ name: 'name_column' })
  name: string;
}
```

## 3. Validation (DTO)

**Không có `ValidationPipe` global** trong `main.ts`. Phải khai báo `ValidationPipe` ở từng param của controller:

```ts
async createExample(
  @Body(new ValidationPipe({ transform: true, whitelist: true }))
  requestData: CreateExampleRequestDto,
) { ... }
```

Convention đặt tên DTO: `Create<X>RequestDto`, `Update<X>RequestDto`, `<X>ResponseDto` (thường extends `BaseResponseDto`). Mỗi field decorate đủ 3 lớp: `@AutoMap()` + `@ApiProperty()` + class-validator:

```ts
export class CreateExampleRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The name of example', example: 'Example A' })
  @IsNotEmpty({ message: 'EXAMPLE_NAME_IS_REQUIRED' })
  name: string;

  @AutoMap()
  @ApiProperty({ description: 'The description of example', required: false })
  @IsOptional()
  description?: string;
}
```

Query phân trang kế thừa `BaseQueryDto` (`src/app/base.dto.ts`): có sẵn `page`, `size`, `sort: string[]`.

## 4. Response chuẩn (bắt buộc dùng cho mọi controller)

Không có interceptor tự động wrap response — **controller tự build** theo `AppResponseDto<T>` (`src/app/app.dto.ts`):

```ts
{ statusCode, timestamp, method, path, result, message }
```

Ví dụ:
```ts
return {
  message: 'Example has been created successfully',
  statusCode: HttpStatus.CREATED,
  timestamp: new Date().toISOString(),
  result,
} as AppResponseDto<ExampleResponseDto>;
```

Danh sách phân trang dùng `AppPaginatedResponseDto<T>` lồng vào field `result`:
```ts
{ total, page, pageSize, items, hasPrevios, hasNext, totalPages }
// Promise<AppResponseDto<AppPaginatedResponseDto<ExampleResponseDto>>>
```

## 5. Exception & mã lỗi

- Global filter: `src/app/http-exception.filter.ts` (`@Catch(HttpException)`, đăng ký qua `APP_FILTER` trong `app.module.ts`). Trả về:
```ts
{ statusCode, timestamp, path, method, message }
```
- Mọi exception nghiệp vụ phải kế thừa `AppException` (`src/app/app.exception.ts`). Mỗi module tự định nghĩa exception + bảng mã lỗi riêng:

```ts
// example.exception.ts
export class ExampleException extends AppException {
  constructor(errorCodeValue, message?, statusCode?) {
    super(errorCodeValue, message, statusCode);
  }
}
```

```ts
// example.validation.ts — khai báo dải mã lỗi riêng cho module (VD 999901-999903), gộp vào AppValidation trung tâm (src/app/app.validation.ts)
```

> Có guard chống trùng mã lỗi giữa các module — throw lúc khởi động nếu trùng.

> **Quy ước quan trọng — message của class-validator phải trùng KEY trong `*Validation`**: `HttpExceptionFilter` lấy `message` từ exception, rồi tra `AppValidation[message] || AuthValidation[message]` (map theo tên module `Validation` được gộp trong `app.validation.ts`) để đổi thành `statusCode: 422` + `code` + message chuẩn. Vì vậy khi viết `@IsNotEmpty({ message: 'EXAMPLE_NAME_IS_REQUIRED' })` trên DTO, **giá trị `message` phải đúng bằng key** đã khai báo trong `<module>.validation.ts` (ví dụ `PHONENUMBER_IS_REQUIRED`, không phải câu văn tự do) thì lỗi validate mới được map đúng mã/message nghiệp vụ; nếu không khớp key nào, response sẽ trả nguyên message thô đó với `statusCode` mặc định (400).

## 6. Automapper (Entity <-> Dto)

Mỗi module có file `<module>.mapper.ts` chứa 1 `AutomapperProfile`, đăng ký làm provider trong `<module>.module.ts`:

```ts
@Injectable()
export class ExampleProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) { super(mapper); }
  override get profile() {
    return (mapper: Mapper) => {
      createMap(mapper, Example, ExampleResponseDto, baseMapper());
      createMap(mapper, CreateExampleRequestDto, Example,
        forMember(d => d.name, mapFrom(s => s.name?.trim())));
    };
  }
}
```

> `baseMapper()` (`src/app/base.mapper.ts`) **không nhận tham số** và trả thẳng về 1 `MappingConfiguration` (chỉ tường minh hoá field `id`, các field `slug`/`createdAt`/`updatedAt` đã tự map qua `@AutoMap()` kế thừa) — truyền thẳng làm tham số thứ 4 của `createMap`, không bọc qua `extend(...)`. Luôn truyền `baseMapper()` khi map Entity → ResponseDto.

## 7. Guard & decorator xác thực/phân quyền (global, đã đăng ký sẵn)

Đăng ký thứ tự trong `app.module.ts` qua `APP_GUARD`: `JwtOptionalAuthGuard` → `RolesGuard` → `ThrottlerGuard` → `FeatureGuard`.

- **`JwtOptionalAuthGuard`** (`src/auth/passport/jwt/jwt-optional-auth.guard.ts`): route có `@Public()` thì không bắt buộc JWT hợp lệ (fallback user rỗng), ngược lại bắt buộc JWT.
- **`RolesGuard`** (`src/role/roles.guard.ts`): check `@Public()` trước, sau đó so `@HasRoles(...)` với role của user hiện tại.
- **`ThrottlerGuard`**: rate limit toàn cục (`ttl: 60000, limit: 100000`).
- **`FeatureGuard`** (`src/feature-flag-system/guard/fureture.guard.ts`): check `@Feature('group:feature:child')` qua `FeatureFlagSystemService`.

Decorator dùng trong controller:
- `@Public()` — bỏ qua yêu cầu JWT/role.
- `@HasRoles(RoleEnum.Admin, ...)` — giới hạn theo role.
- `@CurrentUser()` — param decorator lấy `request.user`.
- `@Feature('key')` — bật/tắt theo feature flag.

## 8. Interceptor phân quyền field-level

`RoleBasedSerializationInterceptor` (`src/role/role.interceptor.ts`, global qua `APP_INTERCEPTOR`): tự động ẩn/hiện field trong response DTO theo role, dựa trên `@Expose({ groups: [RoleEnum.Admin] })` (class-transformer) trên field của Response DTO.

## 9. Swagger convention

```ts
@ApiTags('Example')
@ApiBearerAuth()
@Controller('examples')
export class ExampleController {
  @ApiOperation({ summary: '...' })
  @ApiResponseWithType({ status: 201, description: '...', type: ExampleResponseDto })
  ...
}
```

`@ApiResponseWithType(...)` và `@ApiPaginatedResponse(...)` là decorator tự viết (`src/app/app.decorator.ts`) — bọc schema đúng theo `AppResponseDto`/`AppPaginatedResponseDto`, luôn dùng thay vì `@ApiResponse` thô khi trả dữ liệu qua wrapper chuẩn.

## 10. Auth flow (tham khảo khi cần thêm logic liên quan JWT)

- Strategy: `src/auth/passport/jwt/jwt.strategy.ts` — decode JWT, load `User` kèm `role.permissions.authority.authorityGroup`, build `scope` (permissions), trả về `CurrentUserDto { userId, userName, roleName, scope }`.
- Payload JWT: `AuthJwtPayload { sub, jti, scope?, exp? }` (`src/auth/auth.dto.ts`).
- Login: `AuthService.login()` — sign access token + refresh token cùng lúc trong `generateToken()`. **Chưa có endpoint `POST /auth/refresh`** để verify/dùng lại `refreshToken` — token này hiện được trả về nhưng không có route nào tiêu thụ nó, cần tự viết nếu cần.

## 11. Logging

`src/config/logger.config.ts` dùng Winston (qua `nest-winston`) với 3 transport: Console (format kiểu Nest), `DatabaseTransport` (`src/logger/database.transport.ts`, ghi log vào DB), `OpenTelemetryTransportV3`. Trace id request được gắn qua `LoggerMiddleware` (`src/logger/logger.middleware.ts`, áp dụng global `forRoutes('*')`), tách biệt với `nestjs-cls` (dùng để lưu `user`/`userSlug` theo request context, ví dụ trong `JwtStrategy`).

## 12. Common/shared code nằm ở đâu

Không có `src/common`. Chỗ chứa mã dùng chung:
- **`src/app/`**: response DTO (`app.dto.ts`), exception/error-code base (`app.exception.ts`, `app.validation.ts`), `base.entity.ts`/`base.dto.ts`/`base.mapper.ts`, `http-exception.filter.ts`, swagger decorator (`app.decorator.ts`), `env.validation.ts`.
- **`src/shared/`**: `constants/`, `decorators/`, `interfaces/commons/`, `redis/`, `services/` (balance, coin-policy, export-file, point-transaction dùng chung), `utils/` (currency, excel, file, obj).
- Guard/decorator/interceptor xác thực-phân quyền **không tập trung** mà nằm ngay trong module sở hữu (`src/auth/`, `src/role/`, `src/feature-flag-system/`, `src/user/user.decorator.ts`).

## Checklist khi tạo feature mới

1. Tạo entity kế thừa `Base`.
2. Tạo `Create/Update RequestDto` + `ResponseDto`, decorate `@AutoMap()` + `@ApiProperty()` + class-validator.
3. Viết `<module>.mapper.ts` với `AutomapperProfile`, nhớ truyền `baseMapper()` làm tham số thứ 4 của `createMap` khi map Entity → ResponseDto (xem mục 6, không bọc qua `extend(...)`).
4. Viết `<module>.exception.ts` (extends `AppException`) + `<module>.validation.ts` (mã lỗi riêng, không trùng dải mã module khác).
5. Controller: áp `ValidationPipe({ transform: true, whitelist: true })` cho từng `@Body`/`@Query`; build response theo `AppResponseDto`/`AppPaginatedResponseDto`; gắn `@ApiTags`, `@ApiBearerAuth`, `@ApiResponseWithType`/`@ApiPaginatedResponse`.
6. Gắn `@Public()`/`@HasRoles()`/`@Feature()` nếu cần giới hạn truy cập.
7. Đăng ký `TypeOrmModule.forFeature([Entity])`, controller, service, mapper profile trong `<module>.module.ts`.
8. Sinh migration: `npm run typeorm:g --name=<ten>` rồi `npm run typeorm:r`.

---

# Module mẫu đã có sẵn trong code: `src/example/`

Module này tồn tại thật trong `src/example/` và đã đăng ký trong `app.module.ts` — minh hoạ đầy đủ CRUD (create, findAll phân trang, findOne, update, delete) đúng theo toàn bộ convention ở trên. Dùng làm template: copy cả folder, đổi tên `Example`→`<Feature>`, sửa field theo domain thật, rồi làm theo "Checklist khi tạo feature mới" ở trên (đăng ký module, gộp validation, sinh migration...). Nội dung dưới đây phản ánh đúng code hiện có trong `src/example/`.

### `example.entity.ts`

```ts
import { Entity, Column } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { Base } from 'src/app/base.entity';

@Entity('example_tbl')
export class Example extends Base {
  @AutoMap()
  @Column({ name: 'name_column' })
  name: string;

  @AutoMap()
  @Column({ name: 'description_column', nullable: true })
  description?: string;
}
```

### `example.dto.ts`

```ts
import { IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AutoMap } from '@automapper/classes';
import { BaseQueryDto, BaseResponseDto } from 'src/app/base.dto';

export class CreateExampleRequestDto {
  @AutoMap()
  @ApiProperty({ description: 'The name of example', example: 'Example A' })
  @IsNotEmpty({ message: 'EXAMPLE_NAME_IS_REQUIRED' })
  name: string;

  @AutoMap()
  @ApiProperty({ description: 'The description of example', required: false })
  @IsOptional()
  description?: string;
}

export class UpdateExampleRequestDto extends CreateExampleRequestDto {}

// Query dto cho endpoint findAll phân trang, kế thừa page/size/sort có sẵn
export class GetAllExampleRequestDto extends BaseQueryDto {}

export class ExampleResponseDto extends BaseResponseDto {
  @AutoMap()
  @ApiProperty()
  name: string;

  @AutoMap()
  @ApiProperty()
  description?: string;
}
```

### `example.validation.ts`

```ts
import { createErrorCode, TErrorCodeValue } from 'src/app/app.validation';

export const EXAMPLE_NOT_FOUND = 'EXAMPLE_NOT_FOUND';
export const EXAMPLE_NAME_DOES_EXIST = 'EXAMPLE_NAME_DOES_EXIST';
export const EXAMPLE_NAME_IS_REQUIRED = 'EXAMPLE_NAME_IS_REQUIRED';

export type TExampleErrorCodeKey =
  typeof EXAMPLE_NOT_FOUND | typeof EXAMPLE_NAME_DOES_EXIST | typeof EXAMPLE_NAME_IS_REQUIRED;

export type TExampleErrorCode = Record<TExampleErrorCodeKey, TErrorCodeValue>;

// Chọn 1 dải mã lỗi CHƯA dùng — kiểm tra các file *.validation.ts khác để tránh trùng
export const ExampleValidation: TExampleErrorCode = {
  EXAMPLE_NOT_FOUND: createErrorCode(999901, 'Example not found'),
  EXAMPLE_NAME_DOES_EXIST: createErrorCode(999902, 'Example name does exist'),
  EXAMPLE_NAME_IS_REQUIRED: createErrorCode(999903, 'Example name is required'),
};
```

> Lưu ý `EXAMPLE_NAME_IS_REQUIRED` tồn tại ở đây **vì** `example.dto.ts` dùng đúng key này làm `message` của `@IsNotEmpty` (xem mục 5 "Quy ước quan trọng" ở trên) — minh hoạ đúng cách class-validator message khớp với `*Validation` map.

### `example.exception.ts`

```ts
import { HttpStatus } from '@nestjs/common';
import { AppException } from 'src/app/app.exception';
import { TErrorCodeValue } from 'src/app/app.validation';

export class ExampleException extends AppException {
  constructor(
    errorCodeValue: TErrorCodeValue | HttpStatus,
    message?: string,
    statusCode?: number,
  ) {
    super(errorCodeValue, message, statusCode);
  }
}
```

### `example.mapper.ts`

```ts
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { createMap, forMember, mapFrom, Mapper } from '@automapper/core';
import { Injectable } from '@nestjs/common';
import {
  CreateExampleRequestDto,
  ExampleResponseDto,
  UpdateExampleRequestDto,
} from './example.dto';
import { Example } from './example.entity';
import { baseMapper } from 'src/app/base.mapper';

@Injectable()
export class ExampleProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile() {
    return (mapper: Mapper) => {
      createMap(mapper, Example, ExampleResponseDto, baseMapper());

      createMap(
        mapper,
        CreateExampleRequestDto,
        Example,
        forMember((d) => d.name, mapFrom((s) => s.name?.trim())),
      );

      createMap(
        mapper,
        UpdateExampleRequestDto,
        Example,
        forMember((d) => d.name, mapFrom((s) => s.name?.trim())),
      );
    };
  }
}
```

### `example.service.ts`

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { FindManyOptions, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectMapper } from '@automapper/nestjs';
import { Mapper } from '@automapper/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import {
  CreateExampleRequestDto,
  ExampleResponseDto,
  GetAllExampleRequestDto,
  UpdateExampleRequestDto,
} from './example.dto';
import { Example } from './example.entity';
import { ExampleException } from './example.exception';
import { ExampleValidation } from './example.validation';
import { AppPaginatedResponseDto } from 'src/app/app.dto';

@Injectable()
export class ExampleService {
  constructor(
    @InjectRepository(Example) private readonly exampleRepository: Repository<Example>,
    @InjectMapper() private readonly mapper: Mapper,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: Logger,
  ) {}

  async createExample(dto: CreateExampleRequestDto): Promise<ExampleResponseDto> {
    const context = `${ExampleService.name}.${this.createExample.name}`;
    const data = this.mapper.map(dto, CreateExampleRequestDto, Example);
    const existed = await this.exampleRepository.findOneBy({ name: data.name });
    if (existed) throw new ExampleException(ExampleValidation.EXAMPLE_NAME_DOES_EXIST);

    const created = await this.exampleRepository.save(this.exampleRepository.create(data));
    this.logger.log(`Example created: ${created.id}`, context);
    return this.mapper.map(created, Example, ExampleResponseDto);
  }

  async findAll(query: GetAllExampleRequestDto): Promise<AppPaginatedResponseDto<ExampleResponseDto>> {
    const options: FindManyOptions<Example> = {
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.size,
      take: query.size,
    };
    const [items, total] = await this.exampleRepository.findAndCount(options);
    const totalPages = Math.ceil(total / query.size);

    return {
      items: this.mapper.mapArray(items, Example, ExampleResponseDto),
      total,
      page: query.page,
      pageSize: query.size,
      totalPages,
      hasNext: query.page < totalPages,
      hasPrevios: query.page > 1,
    } as AppPaginatedResponseDto<ExampleResponseDto>;
  }

  async findOne(slug: string): Promise<ExampleResponseDto> {
    const example = await this.exampleRepository.findOneBy({ slug });
    if (!example) throw new ExampleException(ExampleValidation.EXAMPLE_NOT_FOUND);
    return this.mapper.map(example, Example, ExampleResponseDto);
  }

  async updateExample(slug: string, dto: UpdateExampleRequestDto): Promise<ExampleResponseDto> {
    const example = await this.exampleRepository.findOneBy({ slug });
    if (!example) throw new ExampleException(ExampleValidation.EXAMPLE_NOT_FOUND);

    const data = this.mapper.map(dto, UpdateExampleRequestDto, Example);
    if (data.name !== example.name) {
      const existed = await this.exampleRepository.findOneBy({ name: data.name });
      if (existed) throw new ExampleException(ExampleValidation.EXAMPLE_NAME_DOES_EXIST);
    }

    Object.assign(example, data);
    const updated = await this.exampleRepository.save(example);
    return this.mapper.map(updated, Example, ExampleResponseDto);
  }

  async deleteExample(slug: string): Promise<number> {
    const example = await this.exampleRepository.findOneBy({ slug });
    if (!example) throw new ExampleException(ExampleValidation.EXAMPLE_NOT_FOUND);
    await this.exampleRepository.softRemove(example);
    return 1;
  }
}
```

### `example.controller.ts`

```ts
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam,
} from '@nestjs/swagger';
import {
  HttpStatus, HttpCode, Post, Body, Controller, ValidationPipe,
  Get, Patch, Param, Delete, Query,
} from '@nestjs/common';
import {
  CreateExampleRequestDto, ExampleResponseDto,
  GetAllExampleRequestDto, UpdateExampleRequestDto,
} from './example.dto';
import { ExampleService } from './example.service';
import { Public } from 'src/auth/decorator/public.decorator';
import { HasRoles } from 'src/role/roles.decorator';
import { RoleEnum } from 'src/role/role.enum';
import { ApiPaginatedResponse, ApiResponseWithType } from 'src/app/app.decorator';
import { AppPaginatedResponseDto, AppResponseDto } from 'src/app/app.dto';

@ApiTags('Example')
@Controller('examples')
@ApiBearerAuth()
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Post()
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new example' })
  @ApiResponseWithType({ status: HttpStatus.CREATED, description: 'Created', type: ExampleResponseDto })
  async createExample(
    @Body(new ValidationPipe({ transform: true, whitelist: true })) requestData: CreateExampleRequestDto,
  ) {
    const result = await this.exampleService.createExample(requestData);
    return {
      message: 'Example has been created successfully',
      statusCode: HttpStatus.CREATED,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExampleResponseDto>;
  }

  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all examples (paginated)' })
  @ApiPaginatedResponse(ExampleResponseDto, 'Retrieved')
  async findAll(
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: GetAllExampleRequestDto,
  ) {
    const result = await this.exampleService.findAll(query);
    return {
      message: 'All examples have been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<AppPaginatedResponseDto<ExampleResponseDto>>;
  }

  @Get(':slug')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get an example by slug' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Retrieved', type: ExampleResponseDto })
  @ApiParam({ name: 'slug', required: true, example: 'example-abc123' })
  async findOne(@Param('slug') slug: string) {
    const result = await this.exampleService.findOne(slug);
    return {
      message: 'Example has been retrieved successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExampleResponseDto>;
  }

  @Patch(':slug')
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update an example' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Updated', type: ExampleResponseDto })
  @ApiParam({ name: 'slug', required: true, example: 'example-abc123' })
  async updateExample(
    @Param('slug') slug: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) requestData: UpdateExampleRequestDto,
  ) {
    const result = await this.exampleService.updateExample(slug, requestData);
    return {
      message: 'Example has been updated successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result,
    } as AppResponseDto<ExampleResponseDto>;
  }

  @Delete(':slug')
  @HasRoles(RoleEnum.Admin, RoleEnum.SuperAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an example' })
  @ApiResponseWithType({ status: HttpStatus.OK, description: 'Deleted', type: String })
  @ApiParam({ name: 'slug', required: true, example: 'example-abc123' })
  async deleteExample(@Param('slug') slug: string) {
    const result = await this.exampleService.deleteExample(slug);
    return {
      message: 'Example has been deleted successfully',
      statusCode: HttpStatus.OK,
      timestamp: new Date().toISOString(),
      result: `${result} example have been deleted successfully`,
    } as AppResponseDto<string>;
  }
}
```

### `example.module.ts`

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExampleController } from './example.controller';
import { ExampleService } from './example.service';
import { Example } from './example.entity';
import { ExampleProfile } from './example.mapper';

@Module({
  imports: [TypeOrmModule.forFeature([Example])],
  controllers: [ExampleController],
  providers: [ExampleService, ExampleProfile],
  exports: [ExampleService],
})
export class ExampleModule {}
```

### Đăng ký vào hệ thống

`ExampleModule` **đã được đăng ký thật** trong `src/app/app.module.ts` (import + đưa vào mảng `imports`), `ExampleValidation` đã gộp vào `AppValidation` (`src/app/app.validation.ts`), và migration `create-example-table` đã chạy sẵn trong `src/migrations/`. Khi tạo module mới theo template này, lặp lại đúng 3 bước sau cho module của bạn:

1. `src/app/app.module.ts`: thêm `import { <Feature>Module } from 'src/<feature>/<feature>.module';` và thêm vào mảng `imports`.
2. `src/app/app.validation.ts`: thêm `import { <Feature>Validation } from 'src/<feature>/<feature>.validation';` và `...<Feature>Validation,` vào object `AppValidation`.
3. Sinh migration cho entity mới: `npm run typeorm:g --name=create-<feature>-table` rồi `npm run typeorm:r`.

---

# Module Auth (hiện tại: chỉ đăng nhập/đăng ký bằng số điện thoại + mật khẩu)

Phần này mô tả đúng flow **đang có trong code** (`src/auth/`). `src/auth/` hiện chỉ có: `auth.controller.ts`, `auth.service.ts`, `auth.dto.ts`, `auth.exception.ts`, `auth.validation.ts`, `auth.utils.ts`, `decorator/public.decorator.ts`, `passport/jwt/` (strategy + optional-auth guard), `root-user.seeder.ts`. Đây là toàn bộ auth hiện có — không có OTP, quên/đổi mật khẩu, refresh-token endpoint, hay local strategy.

## Endpoint đăng nhập

```
POST /api/{VERSION}/auth/login
Content-Type: application/json

{
  "phonenumber": "0376295216",
  "password": "password"
}
```

Response (`200 OK`):
```json
{
  "message": "Login successful",
  "statusCode": 200,
  "timestamp": "2026-07-06T...",
  "result": {
    "accessToken": "...",
    "refreshToken": "...",
    "expireTime": "...",
    "expireTimeRefreshToken": "..."
  }
}
```

> Lưu ý field JSON là `phonenumber` (viết liền, không phải `phoneNumber`/`phone`). DTO (`src/auth/auth.dto.ts`) chỉ validate `@IsNotEmpty` cho cả `phonenumber` và `password`, chưa có kiểm tra định dạng số điện thoại.

## Luồng xử lý (`src/auth/auth.service.ts`)

Controller (`auth.controller.ts`) route `POST /auth/login` gắn `@Public()`, nhận `LoginAuthRequestDto`, gọi thẳng `authService.login(...)`. Chỉ có JWT strategy (`src/auth/passport/jwt/`), không có local strategy.

```ts
// validateUser: tìm user theo phonenumber, so sánh password bằng bcrypt
async validateUser(phonenumber: string, pass: string): Promise<User | null> {
  const user = await this.userRepository.findOne({
    where: { phonenumber },
    relations: { role: { permissions: { authority: { authorityGroup: true } } } },
  });
  if (!user) return null;
  if (user.phonenumber === 'default-customer') return null; // chặn tài khoản hệ thống/guest
  const isMatch = await bcrypt.compare(pass, user.password);
  if (!isMatch) return null;
  return user;
}

// login: validate -> check active -> build JWT payload -> generateToken
async login(loginAuthDto: LoginAuthRequestDto): Promise<LoginAuthResponseDto> {
  const user = await this.validateUser(loginAuthDto.phonenumber, loginAuthDto.password);
  if (!user) throw new AuthException(AuthValidation.INVALID_CREDENTIALS);

  checkActiveUser(user);        // AuthValidation.USER_NOT_ACTIVE nếu user.isActive === false

  const payload: AuthJwtPayload = { sub: user.id, jti: uuidv4(), scope: this.authUtils.buildScope(user) };
  return this.generateToken(payload);
}

// generateToken: ký access token + refresh token riêng, hạn dùng lấy từ DURATION / REFRESHABLE_DURATION
async generateToken(payload: AuthJwtPayload): Promise<LoginAuthResponseDto> {
  const refreshPayload: AuthJwtPayload = {
    sub: payload.sub, jti: payload.jti,
    exp: Math.floor(Date.now() / 1000) + this.refeshableDuration,
  };
  return {
    accessToken: this.jwtService.sign({ ...payload, exp: Math.floor(Date.now() / 1000) + this.duration }),
    expireTime: moment().add(this.duration, 'seconds').toString(),
    refreshToken: this.jwtService.sign(refreshPayload),
    expireTimeRefreshToken: moment().add(this.refeshableDuration, 'seconds').toString(),
  };
}
```

Sai mật khẩu và không tìm thấy user **đều trả về cùng lỗi** `INVALID_CREDENTIALS` (không phân biệt để tránh lộ thông tin).

## Seed Role & tài khoản admin đầu tiên (đã tự động hoá)

Không cần tự `INSERT` role bằng SQL thủ công trước khi test:

- Migration `seed-roles` (`src/migrations/1783728000004-seed-roles.ts`) tự insert sẵn 3 role `CUSTOMER`/`ADMIN`/`SUPER_ADMIN` vào `role_tbl` (chạy cùng `npm run typeorm:r`, không có `STAFF`/`CASHIER`/`CHEF`/`MANAGER`/`TELESALE` dù các giá trị này vẫn hợp lệ trong `RoleEnum` — cần tự thêm role nếu muốn test các role đó).
- `RootUserSeeder` (`OnApplicationBootstrap`) tự tạo 1 user role `SUPER_ADMIN` (`phonenumber`/`password` lấy từ `ROOT_PHONENUMBER`/`ROOT_PASSWORD` trong `.env`, mặc định `root`/`root`) ngay lần đầu app khởi động sau khi migrate — dùng tài khoản này để test route giới hạn bởi `@HasRoles(...)` **mà không cần** đăng ký + update DB thủ công.

Giá trị hợp lệ cho `name_column` — theo `RoleEnum` (`src/role/role.enum.ts`): `CUSTOMER`, `STAFF`, `CASHIER`, `CHEF`, `MANAGER`, `ADMIN`, `SUPER_ADMIN`, `TELESALE`.

## Đăng ký tài khoản mới (không có OTP)

Chỉ có 1 endpoint đăng ký, không có flow OTP:

```
POST /api/{VERSION}/auth/register
{
  "phonenumber": "0900000000",
  "password": "password"
}
```

`AuthService.register()`: kiểm tra `phonenumber` chưa tồn tại → gán role `CUSTOMER` (đã seed sẵn qua migration) → hash password bằng `bcrypt.hash(password, SALT_ROUNDS)` → tạo user mới. Sau khi register xong, dùng đúng `phonenumber`/`password` đó để gọi `POST /auth/login` như mô tả ở trên.

> Muốn tài khoản có quyền `ADMIN`/`SUPER_ADMIN` để test route giới hạn bởi `@HasRoles(...)`, đơn giản nhất là dùng tài khoản root đã tự seed sẵn (`ROOT_PHONENUMBER`/`ROOT_PASSWORD`, xem mục trên). Muốn nâng role cho 1 user khác, cần **update thủ công** cột `role_id_column` của user đó trong DB trỏ sang `id_column` của role `ADMIN`/`SUPER_ADMIN` — chưa có endpoint đổi role qua API.

## Entity `User` liên quan tới auth (`src/user/user.entity.ts`, bảng `user_tbl`)

```ts
@Column({ name: 'phonenumber_column', unique: true })
phonenumber: string;

@Column({ name: 'password_column' })
password: string;

@Column({ name: 'is_active_column', default: true })
isActive: boolean; // gate login qua checkActiveUser

@ManyToOne(() => Role, { eager: true })
@JoinColumn({ name: 'role_id_column' })
role: Role;
```

Không có `@BeforeInsert` hash password trên entity — việc hash (`bcrypt.hash(rawPassword, this.saltRounds)`) được thực hiện thủ công trong `AuthService.register()` trước khi save.

> Trước đây entity có thêm `needUpdatePassword`/`needUpdatePhoneNumber` (dự định gate login bắt đổi mật khẩu/SĐT) nhưng chưa từng có service nào set giá trị `true` — đã **bỏ hẳn** (xoá field khỏi entity, xoá `checkUserRequirement()` khỏi `auth.utils.ts`, xoá mã lỗi `NEED_UPDATE_PASSWORD`/`NEED_UPDATE_PHONE_NUMBER` khỏi `auth.validation.ts`, bỏ luôn 2 cột khỏi `create-user-table` migration — không tạo migration riêng để drop vì tính năng chưa từng chạy thật ở môi trường nào). Cần tính năng này thì viết lại từ đầu khi có yêu cầu thật.

## JWT payload & cấu hình

`AuthJwtPayload` (`src/auth/auth.dto.ts`): `{ sub, jti, scope?, exp? }` — `sub` là `user.id`, `scope` là scope quyền hạn (JSON string).

Biến môi trường liên quan (đã có trong bảng env ở đầu tài liệu):
- `SALT_ROUNDS` (10-12): cost factor cho `bcrypt.hash`.
- `DURATION`: thời hạn access token (giây).
- `REFRESHABLE_DURATION`: thời hạn refresh token (giây).

> JWT secret đọc từ `.env` (`JWT_SECRET`, bắt buộc trong `env.validation.ts`) — `AuthModule` dùng `JwtModule.registerAsync({ ..., useFactory: (configService) => ({ secret: configService.get('JWT_SECRET') }) })`, `JwtStrategy` cũng inject `ConfigService` để lấy cùng secret khi verify. Không set `expiresIn` toàn cục, thời hạn được set thủ công theo từng token (claim `exp`) trong `generateToken`.

## Bảo vệ route bằng JWT (đã có sẵn, không cần setup gì thêm)

Guard đăng ký global (`app.module.ts`), thứ tự: `JwtOptionalAuthGuard` → `RolesGuard` → `ThrottlerGuard` → `FeatureGuard`.

- Route mặc định **yêu cầu JWT hợp lệ** (Bearer token ở header `Authorization`).
- Gắn `@Public()` lên route/controller để bỏ qua yêu cầu JWT (ví dụ route `login`, `register`, các route GET public).
- Trong route đã qua guard, lấy user hiện tại bằng `@CurrentUser()` (trả về `CurrentUserDto { userId, userName, roleName, scope }`, lấy từ `JwtStrategy.validate()` — decode JWT, load `User` kèm `role.permissions.authority.authorityGroup`, chặn nếu `!user.isActive` hoặc không tìm thấy user).
- `JwtStrategy` còn set `user`/`userSlug` vào `nestjs-cls` context (`this.cls.set(...)`) để service không tiện nhận `@CurrentUser()` qua tham số vẫn đọc được user hiện tại.
- Nếu cần giới hạn theo role, gắn thêm `@HasRoles(RoleEnum.Admin, ...)`.

```ts
@Get('me')
async getProfile(@CurrentUser() currentUser: CurrentUserDto) {
  return currentUser; // { userId, userName, roleName, scope }
}
```

Endpoint này thật sự tồn tại: `GET /api/{VERSION}/auth/me` (`auth.controller.ts`), yêu cầu JWT hợp lệ (không có `@Public()`), trả về theo `AppResponseDto<CurrentUserDto>`.

## Test nhanh bằng Swagger

1. Gọi `POST /api/{VERSION}/auth/login` với `phonenumber` + `password` của user đã có sẵn trong DB (seed thủ công hoặc qua migration).
2. Copy `accessToken` từ response, bấm nút **Authorize** trên Swagger UI (`api/api-docs`), dán token (không cần prefix `Bearer` — Swagger tự thêm nếu cấu hình `ApiBearerAuth()` chuẩn).
3. Gọi thử các route cần JWT để xác nhận hoạt động.

## Việc chưa làm / để sau

Các mục dưới đây chưa có code, cần tự viết mới nếu cần:

- Đăng ký OTP, quên mật khẩu, đổi mật khẩu, refresh-token endpoint, xác thực email/phone, xoá tài khoản.
- Validate định dạng số điện thoại ở DTO (hiện chỉ `@IsNotEmpty`).
- Dọn các biến env bắt buộc nhưng không dùng thật (`MAIL_*`, `ACB_*`, `ZALO_OA_*`, `GOOGLE_MAP*`, `FIREBASE_*`) khỏi `env.validation.ts`, hoặc implement module tương ứng nếu vẫn cần dùng — **tạm giữ nguyên, chưa xử lý**.
- Module nghiệp vụ warehouse thật (product/stock/inventory/...) — hiện chỉ có `example/` làm template.

Đã xử lý xong (không còn là nợ kỹ thuật):
- ~~JWT secret hard-code~~ — nay đọc từ `.env` (`JWT_SECRET`), xem mục "JWT payload & cấu hình" ở trên.
- ~~`needUpdatePassword`/`needUpdatePhoneNumber` (tính năng nửa vời, không có code nào set)~~ — đã xoá hẳn khỏi entity/service/validation, xem mục "Entity `User`" ở trên.
- ~~Thiếu health check~~ — đã có `GET /health` (`src/health/`, `@nestjs/terminus` + `@nestjs/axios`, cùng cách làm với order-api), xem mục "Ghi chú hạ tầng khác".

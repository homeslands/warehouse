# Quy ước chung

> Nguồn: `src/main.ts`, `src/app/app.module.ts`, `src/app/app.dto.ts`, `src/app/base.dto.ts`, `src/app/base.mapper.ts`, `src/app/http-exception.filter.ts`, `src/app/optimistic-lock.filter.ts`, `src/app/error-code.util.ts`, `src/app/app.validation.ts`, `src/app/app-common.validation.ts`, `src/shared/utils/pagination.util.ts`, `src/shared/utils/query.util.ts`, `src/auth/passport/jwt/*`, `src/role/role.guard.ts`, `src/role/role.interceptor.ts`, `src/warehouse/guard/warehouse-scope.guard.ts`, `src/feature-flag-system/*`, `src/config/cors.config.ts`, `src/config/session.config.ts` (đường dẫn tương đối từ `app/warehouse-api`).
>
> Mô tả code tại `main` `814c015`. Áp dụng cho mọi endpoint, trừ khi file module ghi khác.

## 1. Base URL

| Mục | Giá trị | Nguồn |
|---|---|---|
| Prefix API | `/api/${VERSION}`. `.env.example` đặt `VERSION=v1`, nên mọi path trong tài liệu này viết là `/api/v1/...` | `src/main.ts:19` |
| Cổng mặc định | `PORT`, mặc định `8085` | `src/main.ts` (`app.listen`) |
| Swagger UI | `/api/api-docs` (không có prefix version). Chỉ để tham khảo, nhiều DTO thiếu `@ApiProperty` nên schema chưa đủ | `src/main.ts:36` |
| Swagger JSON | Code gọi `SwaggerModule.setup(..., { jsonDocumentUrl: 'swagger.json' })` và không bật `useGlobalPrefix`. Theo code của `@nestjs/swagger@7.4.2` (`dist/swagger-module.js:155`), JSON nằm ở **`/swagger.json`**, không phải `/api/api-docs/swagger.json`. **Chưa xác minh bằng chạy thật.** | `src/main.ts:37` |
| Bearer auth trên Swagger | `addBearerAuth()` | `src/main.ts:33` |

## 2. Request

- Body là JSON. Không endpoint nào trong nhóm auth/user/RBAC nhận `multipart`.
- **Không có `ValidationPipe` global.** Từng controller tự gắn `new ValidationPipe({ transform: true, whitelist: true })` cho `@Body()`/`@Query()` (vd `src/auth/auth.controller.ts:50`, `src/user/user.controller.ts:50`). Hệ quả:
  - `whitelist: true` **âm thầm bỏ** field lạ. Không có `forbidNonWhitelisted`, nên gửi thừa field không báo lỗi.
  - `transform: true` đổi query string sang kiểu khai trong DTO (vd `page`, `size` thành số) và gán giá trị mặc định.
  - Path param (`:slug`, `:userSlug`, ...) **không** qua validation. Slug sai/không tồn tại thường trả lỗi `*_NOT_FOUND` của module.
- `@IsOptional()` chỉ bỏ qua `undefined` và `null`. Chuỗi rỗng `""` **vẫn bị validate**. Field tuỳ chọn mà không muốn gửi thì bỏ hẳn khỏi body, đừng gửi `""`.

## 3. Response thành công

Mọi controller nghiệp vụ trả object dạng `AppResponseDto<T>` (`src/app/app.dto.ts`), status theo `@HttpCode` của từng endpoint (thường `200`, tạo mới `201`):

```json
{
  "message": "User has been retrieved successfully",
  "statusCode": 200,
  "timestamp": "2026-11-07T03:00:00.000Z",
  "result": { }
}
```

| Field | Kiểu | Ghi chú |
|---|---|---|
| `message` | `string` | Câu tiếng Anh cố định theo endpoint, chỉ để log. Đừng so khớp chuỗi này |
| `statusCode` | `number` | Trùng HTTP status |
| `timestamp` | `string (ISO-8601, UTC)` | `new Date().toISOString()` lúc trả về |
| `result` | `T` | Dữ liệu. Có thể là object, mảng, `AppPaginatedResponseDto<T>` hoặc chuỗi (vd các endpoint xoá trả `"1 user have been deleted successfully"`) |
| `method`, `path` | — | Có khai trong `AppResponseDto` nhưng **không controller nào gán**. Response thành công không có 2 field này |

Ngoại lệ: `src/app/app.controller.ts` (`/hello`, `/real-ip`, `/error-codes`) và `src/health/health.controller.ts` trả dữ liệu thô, không bọc envelope. Xem [system.md](system.md).

### Dạng dữ liệu chung trong `result`

- **Định danh public là `slug`** (chuỗi 10 ký tự `[a-z0-9]`, `src/app/app.subscriber.ts:4`), không phải `id`. Response không bao giờ có `id` (uuid) (`src/app/base.mapper.ts`, chỉ map `slug/createdAt/updatedAt`). Slug được sinh ngẫu nhiên, kể cả slug của role/authority seed sẵn. FE **không được hardcode slug**. Muốn tìm role thì dùng `name`, muốn tìm authority thì dùng `code`.
- `BaseResponseDto` (`src/app/base.dto.ts`): mọi response DTO kế thừa có `slug`, `createdAt`, `updatedAt`.
- **`createdAt` / `updatedAt` KHÔNG phải ISO-8601.** Mapper đổi `Date → string` bằng `Date.prototype.toString()` (`src/app/base.mapper.ts:14-15`), ra dạng `"Wed Sep 30 2026 11:22:59 GMT+0700 (Indochina Time)"` theo múi giờ server. Fixture FE `app/warehouse-ui/src/entities/user/ui/columns.test.tsx:11` dùng đúng dạng này. `new Date(value)` của trình duyệt V8 parse được dạng này, nhưng chuẩn ECMAScript không bắt buộc.
- Field có giá trị `undefined` **không xuất hiện** trong JSON, vì interceptor chạy `JSON.parse(JSON.stringify(...))` (`src/role/role.interceptor.ts:17`). Field `null` vẫn giữ là `null`. Vì vậy FE cần xử lý cả 2 trường hợp: field vắng mặt và field bằng `null`. Với cột nullable map qua automapper, giá trị trả về là `null` hay vắng mặt thì **chưa xác minh**.
- Entity có optimistic lock có thêm `version: number` (`VersionedResponseDto`, `src/app/base.dto.ts`). Xem mục 9.

## 4. Phân trang, sắp xếp, lọc theo ngày tạo

Endpoint danh sách có phân trang dùng query `BaseQueryDto` (`src/app/base.dto.ts`):

| Query | Kiểu | Bắt buộc | Ràng buộc | Mặc định | Lỗi |
|---|---|---|---|---|---|
| `page` | `number (int ≥ 1)` | không | số nguyên ≥ 1 | `1` | `PAGE_INVALID` (100854, 422) |
| `size` | `number (int 1..500)` | không | `MAX_PAGE_SIZE = 500` (`base.dto.ts:15`) | `10` | `SIZE_INVALID` (100855, 422) |
| `sort` | `'ASC' \| 'DESC'` | không | không phân biệt hoa thường (trim và upper trước khi validate) | `DESC` | `SORT_INVALID` (100852, 422) |
| `startDate` | `string` | không | `YYYY-MM-DD` hoặc ISO-8601 đầy đủ | — | `START_DATE_INVALID` (100850, 422) |
| `endDate` | `string` | không | như trên | — | `END_DATE_INVALID` (100851, 422) |
| `sortBy` | enum riêng từng module | không | xem file module | `createdAt` | `SORT_BY_INVALID` (100853, 422) |

- `startDate`/`endDate` lọc theo `createdAt`, tính theo giờ server (`resolveDateRange`, `src/shared/utils/query.util.ts`): `YYYY-MM-DD` ở `startDate` tính từ 00:00, ở `endDate` tính hết ngày đó (bao gồm cả ngày). Nếu là ISO đầy đủ thì dùng nguyên mốc, `endDate` vẫn bao gồm. Kiểm tra `startDate` phải trước `endDate` là việc của từng module, với mã lỗi riêng (vd `USER_DATE_RANGE_INVALID`).
- Sắp xếp luôn thêm `id ASC` ở cuối để thứ tự giữa các trang ổn định (`buildSortOrder`).
- Một số endpoint dùng `BaseQueryDto` nhưng **không phân trang** (vd `GET /authorities`). File module sẽ ghi rõ. Ở các endpoint đó `page/size/sort/startDate/endDate` vẫn bị validate nhưng không có tác dụng.

`result` của endpoint có phân trang là `AppPaginatedResponseDto<T>` (`src/app/app.dto.ts`, công thức ở `src/shared/utils/pagination.util.ts:15-30`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `items` | `T[]` | |
| `total` | `number` | Tổng bản ghi khớp bộ lọc |
| `page` | `number` | Trang hiện tại, bắt đầu từ 1 |
| `pageSize` | `number` | Bằng `size` của query |
| `totalPages` | `number` | `ceil(total / size)`. Bằng `0` khi `total = 0` |
| `hasNext` | `boolean` | `page < totalPages` |
| `hasPrevios` | `boolean` | **Sai chính tả (thiếu `u`) nhưng là tên chính thức.** `page > 1` |

## 5. Response lỗi

### 5.1 Dạng chung (`HttpExceptionFilter`, `OptimisticLockExceptionFilter`)

Mọi `HttpException` đều được trả về theo dạng sau (`src/app/http-exception.filter.ts:44-51`):

```json
{
  "statusCode": 404,
  "code": 100405,
  "timestamp": "2026-11-07T03:00:00.000Z",
  "path": "/api/v1/users/abc",
  "method": "GET",
  "message": "User not found"
}
```

| Field | Kiểu | Ghi chú |
|---|---|---|
| `statusCode` | `number` | Trùng HTTP status |
| `code` | `number?` | Mã lỗi nghiệp vụ 6 chữ số. **Vắng mặt** khi lỗi không có mã (401/403 của guard, 429, lỗi validation chưa map, ...). Xem 5.3 |
| `timestamp` | `string (ISO-8601)` | |
| `path` | `string` | `request.url`, gồm cả query string |
| `method` | `string` | |
| `message` | `string` | Thông điệp tiếng Anh. **Luôn là 1 chuỗi**, không phải mảng. Dùng `code` để rẽ nhánh, đừng dùng `message` |

### 5.2 Lỗi validation: map message → `code`

Trong DTO, message của class-validator được đặt bằng **key** trong `AppValidation` (vd `@IsNotEmpty({ message: 'USER_PHONENUMBER_IS_REQUIRED' })`). Khi `ValidationPipe` ném `BadRequestException`, filter xử lý như sau (`http-exception.filter.ts:11-41`):

1. Chỉ lấy **message đầu tiên**. Nếu body có nhiều field sai, FE chỉ nhận lỗi của 1 field.
2. Thử message nguyên văn như một key của `AppValidation`. Nếu không khớp, lấy đoạn sau dấu `.` cuối cùng, vì DTO lồng nhau có message dạng `items.0.IMPORT_FORM_ITEM_QUANTITY_INVALID`.
3. Khớp key: `statusCode` = status khai cho key đó, `code` = mã số, `message` = câu tiếng Anh của key. Nếu key không khai status thì mặc định **422** (`createErrorCode`, `src/app/error-code.util.ts:18`).
4. Không khớp key (DTO dùng validator không có `message` riêng, vd `@IsInt()` trần): giữ **400**, `message` là câu gốc của class-validator (vd `"level must be an integer number"`), **không có `code`**.

Vì vậy status của lỗi validation **không cố định**. Nhiều key `*_IS_REQUIRED` khai `400`, còn key không khai status thì ra `422`. FE nên dựa vào `code`.

### 5.3 Lỗi không có `code`

| HTTP | `message` | Khi nào | Nguồn |
|---|---|---|---|
| 401 | `"Unauthorized"` | Thiếu, sai hoặc hết hạn access token; token đã bị thu hồi; dùng refresh token làm access token; user bị khoá hoặc không còn tồn tại (khi cache miss). Xem mục 6.4 | `src/auth/passport/jwt/jwt-optional-auth.guard.ts:36`, `jwt.strategy.ts:36-53` |
| 403 | `"Forbidden resource"` | Thiếu authority (`@RequireAuthority`) hoặc role (`@HasRole`). Đây là message mặc định của Nest khi guard trả `false` | `src/role/role.guard.ts`, `@nestjs/core/guards/constants.js` |
| 403 | `"Feature \"<key>\" is currently disabled"` | `@Feature(key)` bị tắt. Hiện mọi feature đều bật, nên lỗi này chưa xảy ra | `src/feature-flag-system/guard/fureture.guard.ts:21` |
| 403 | `"Forbidden"` | `ForbiddenException()` không message, ném từ service qua `assertHasAnyAuthority` / `assertFullOrOwnAuthority` (`src/authority/authority-check.util.ts`) | |
| 429 | `"ThrottlerException: Too Many Requests"` | Vượt rate limit (mục 10) | `@nestjs/throttler` |
| 503 | `"Service Unavailable"` | Không tính được quyền vì MySQL lỗi ở nhánh cache miss | `jwt.strategy.ts:85` |

Message của các dòng 403 `"Forbidden"` và 503 lấy theo hành vi mặc định của Nest 10, **chưa xác minh bằng chạy thật**.

### 5.4 Lỗi không phải `HttpException` (500)

2 filter global chỉ bắt `HttpException` và `OptimisticLockVersionMismatchError` (`src/app/app.module.ts:110-111`). Lỗi khác (lỗi SQL, lỗi lập trình, Redis lỗi khi logout, ...) đi vào filter mặc định của Nest. Khi đó body chỉ có `{ "statusCode": 500, "message": "Internal server error" }`, **không có** `timestamp/path/method/code`.

### 5.5 Optimistic lock: xung đột version

`OptimisticLockVersionMismatchError` của TypeORM được đổi thành lỗi sau (`src/app/optimistic-lock.filter.ts:8-24`):

| HTTP | code | message |
|---|---|---|
| 409 | 100800 | `Data has been modified by another request, please reload and try again` |

Body có cùng dạng như 5.1. Xem mục 9.

## 6. Xác thực

### 6.1 Gửi token

- Header: `Authorization: Bearer <accessToken>` (`ExtractJwt.fromAuthHeaderAsBearerToken()`, `jwt.strategy.ts:27`).
- **Không dùng cookie.** Token chỉ trả trong body của `/auth/login`, `/auth/refresh`, `/auth/change-password`, và FE tự lưu.
- `express-session` (store MySQL, bảng `session_tbl`, cookie `maxAge` 24h) **có được mount** (`src/main.ts:22`, `src/config/session.config.ts`), nhưng không đoạn code nào đọc hoặc ghi `req.session` (grep `req.session|request.session|@Session` trong `src/` không có kết quả). Với `saveUninitialized: false` (`session.config.ts:33`), về lý thuyết server không gửi `Set-Cookie`. **Chưa xác minh bằng chạy thật.** FE không cần, và không nên dựa vào cookie.
- CORS bật `credentials: true` (`src/config/cors.config.ts:11`), nhưng gọi API không cần `withCredentials`, vì xác thực đi qua header.

### 6.2 Access token và refresh token

| | Access token | Refresh token |
|---|---|---|
| Thời hạn | `DURATION` giây (`.env.example`: `900` = 15 phút) | `REFRESHABLE_DURATION` giây (`.env.example`: `2592000` = 30 ngày) |
| Claim | `sub` (uuid user), `jti`, `sid`, `role` (tên role), `type: "access"`, `exp`, `iat` | `sub`, `jti`, `sid`, `type: "refresh"`, `exp`, `iat`. **Không có `role`** |
| Dùng ở | Header `Authorization` của mọi endpoint không public | Chỉ body của `POST /auth/refresh` |

Nguồn: `src/auth/auth.service.ts` (`buildTokenPair`), `src/auth/auth.dto.ts` (`AuthJwtPayload`).

- Cả 2 token ký bằng cùng `JWT_SECRET` và phân biệt qua claim `type`. Gửi refresh token làm access token sẽ bị 401. Gửi access token vào `/auth/refresh` sẽ bị `INVALID_REFRESH_TOKEN`.
- `/auth/refresh` cấp lại **cả cặp**, giữ nguyên `sid`. Refresh token mới có thời hạn đầy đủ `REFRESHABLE_DURATION`, tính từ lúc refresh. **Không xoay vòng**: refresh token cũ vẫn dùng được tới khi tự hết hạn. Chi tiết ở [auth.md](auth.md).
- `expireTime` / `expireTimeRefreshToken` trong response là chuỗi `moment().toString()`, ví dụ `"Thu Sep 04 2026 10:15:00 GMT+0700"` (`src/auth/auth.controller.spec.ts:19`). **Không phải ISO**, và theo giờ server.

### 6.3 Thu hồi token (Redis deny-list)

Mỗi request có JWT phải qua bước kiểm tra thu hồi (`src/auth/token-revocation.service.ts`, `jwt.strategy.ts:42`):

- `logout`: thu hồi phiên hiện tại (theo `sid`). Cả access lẫn refresh token của phiên đó chết ngay ở request kế tiếp.
- `logout-all`, tự đổi mật khẩu, đổi mật khẩu hộ, khoá user, xoá user, đổi role: thu hồi **mọi** token của user được phát trước thời điểm đó.
- **Fail-closed**: nếu Redis lỗi, mọi request có JWT đều trả 401.

### 6.4 Khi nào 401

| Tình huống | HTTP | code |
|---|---|---|
| Không gửi `Authorization` tới endpoint không public | 401 | — |
| Token sai chữ ký, hết hạn, hoặc sai dạng | 401 | — |
| Token đã bị thu hồi (6.3) | 401 | — |
| Refresh token bị dùng làm access token | 401 | — |
| User không còn tồn tại hoặc đã bị khoá, phát hiện khi cache quyền miss | 401 | — |
| Sai số điện thoại hoặc mật khẩu ở `/auth/login` | 401 | 100001 |
| Refresh token sai, hết hạn, hoặc bị thu hồi ở `/auth/refresh` | 401 | 100003 / 100004 / 100005 |

Gợi ý cho interceptor FE: 401 **không có `code`** ở endpoint khác `/auth/*` thì gọi `/auth/refresh` một lần rồi gửi lại request. Nếu refresh trả 401 (100003/100004/100005) hoặc 403 (100002) thì đăng xuất phía client. 401 có `code = 100001` chỉ đến từ form login, không phải phiên hết hạn. Sai mật khẩu hiện tại ở `/auth/change-password` cố ý trả **422** (100013), không phải 401.

### 6.5 Endpoint public

`@Public()` (`src/auth/decorator/public.decorator.ts`) đánh dấu endpoint không cần token. Trên endpoint public, `JwtOptionalAuthGuard` cho qua kể cả khi token thiếu, sai hoặc bị thu hồi (`jwt-optional-auth.guard.ts:32-34`). Mọi guard phân quyền phía sau cũng bỏ qua endpoint public.

## 7. Guard global và decorator

Thứ tự chạy, theo đúng thứ tự đăng ký trong `src/app/app.module.ts:112-118`. Guard đầu tiên chặn sẽ quyết định lỗi trả về:

| # | Guard | Bật bởi decorator | Làm gì | Lỗi khi chặn |
|---|---|---|---|---|
| 1 | `JwtOptionalAuthGuard` | Mặc định bật cho mọi route. `@Public()` để tắt | Xác thực JWT, kiểm tra thu hồi, nạp `user = { userId, roleName, sessionId, scope }` | 401 (mục 6.4), 503 |
| 2 | `AuthorityGuard` | `@RequireAuthority(A, B, ...)` (`src/authority/authority.decorator.ts`) | User phải có **đủ tất cả** code (AND) trong `scope`. `SUPER_ADMIN` bỏ qua (`role.guard.ts:32-36`) | 403 `"Forbidden resource"` |
| 3 | `WarehouseScopeGuard` | `@WarehouseScope(param = 'slug')` (`src/warehouse/decorator/warehouse-scope.decorator.ts`) | User phải là manager hoặc member của kho có slug nằm ở **route param** `param`. `SUPER_ADMIN` và `ADMIN` bỏ qua | 404 `WAREHOUSE_NOT_FOUND` (100501), 403 `WAREHOUSE_ACCESS_DENIED` (100523) |
| 4 | `HasRoleGuard` | `@HasRole(RoleEnum...)` (`src/role/role.decorator.ts`) | `roleName` (claim `role` của token) nằm trong danh sách. `SUPER_ADMIN` bỏ qua. Token không có claim `role` bị chặn | 403 `"Forbidden resource"` |
| 5 | `ThrottlerGuard` | Mặc định cho mọi route. `@Throttle(...)` để ghi đè | Rate limit theo IP (mục 10) | 429 |
| 6 | `FeatureGuard` | `@Feature('group:feature:child')` | `FeatureFlagSystemService.isEnabled()` hiện **luôn trả `true`** (`feature-flag-system.service.ts:8`) | 403 |

Trạng thái sử dụng ở `main` (grep trong `src/`, bỏ `*.spec.ts`):

- `@HasRole(...)`: **không endpoint nào dùng**. Phân quyền endpoint hiện chỉ dựa vào `@RequireAuthority`.
- `@Feature(...)`: **không endpoint nào dùng**.
- `@WarehouseScope('warehouseSlug')`: gắn ở cấp class của `import-form`, `export-form`, `material-batch`. Xem file module tương ứng.
- Endpoint không public mà không có `@RequireAuthority`: mọi user đã đăng nhập đều gọi được, vd `GET /auth/me`, `GET /authorities`, `GET /authority-groups`.

### 7.1 Phạm vi kho (warehouse scope)

- **Không có header phạm vi kho.** Kho lấy từ route param (vd `/warehouses/:warehouseSlug/import-forms`).
- "Thuộc kho" nghĩa là user là `manager` của kho, hoặc là member chưa bị gỡ (`WarehouseService.findUserWarehouse`).
- Một số service còn lọc dữ liệu theo kho bên trong (vd `GET /users` với role khác `ADMIN`/`SUPER_ADMIN`). Từng file module sẽ ghi rõ.

### 7.2 Mô hình quyền mà FE cần biết

- `scope` (danh sách `Authority.code` của role user) lấy từ `GET /auth/me`. Dùng nó để ẩn hoặc hiện nút.
- **`SUPER_ADMIN` có thể có `scope = []`** nhưng vẫn được qua mọi `@RequireAuthority`/`@HasRole`, vì bypass nằm ở guard chứ không ở dữ liệu. FE phải coi `roleName === 'SUPER_ADMIN'` là có mọi quyền.
- Bật hoặc tắt quyền của một role (`PUT/DELETE /roles/:roleSlug/authorities/:authorityCode`) có hiệu lực **ở request kế tiếp** của user thuộc role đó, vì cache bị xoá. Riêng `scope` mà FE đã lưu sẽ cũ cho tới khi gọi lại `/auth/me`.
- Đổi role của user sẽ thu hồi mọi phiên của user đó, nên user phải đăng nhập lại.
- Danh sách mã authority: xem [users-rbac.md](users-rbac.md#danh-sách-mã-authority).

## 8. `RoleBasedSerializationInterceptor`

Interceptor global (`src/role/role.interceptor.ts`, `app.module.ts:119`) chạy `instanceToPlain(data, { groups: [roleName] })` rồi `JSON.parse(JSON.stringify(...))` trên mọi response thành công.

- **Hiện không có field nào ẩn hoặc hiện theo role**: trong `src/` không có `@Expose({ groups })` hay `@Exclude` nào (grep `groups:|@Exclude|@Expose` chỉ ra chính interceptor). Mọi role nhận cùng một dạng response. Dữ liệu khác nhau theo role chỉ đến từ việc service lọc bản ghi, không đến từ việc ẩn field.
- Tác dụng thực tế: loại bỏ field `undefined` (mục 3).

## 9. Optimistic lock (`version`)

- Chỉ entity kế thừa `VersionedBase` (`src/app/versioned.entity.ts`) mới có `version`. Hiện đó là **phiếu nhập** (`ImportForm`) và **phiếu xuất** (`ExportForm`) (grep `extends VersionedBase`). Master data (kho, vật tư, user, role, ...) không có `version`.
- Response của các entity này có `version: number` (`VersionedResponseDto`).
- Request sửa hoặc đổi trạng thái phải gửi lại `version` vừa nhận từ lần GET gần nhất. Validate `@IsNotEmpty @IsInt @Min(1)` với mã lỗi riêng của module (vd `IMPORT_FORM_VERSION_INVALID`). `version: 0` bị chặn, vì TypeORM bỏ qua kiểm tra lock khi version là falsy.
- Nếu version lệch (người khác đã sửa) thì trả **409, code 100800** (`DATA_VERSION_CONFLICT`). FE nên tải lại bản ghi rồi cho người dùng thao tác lại.
- Chi tiết endpoint nào cần `version` xem [import-form.md](import-form.md) và [export-form.md](export-form.md).

## 10. Rate limit (throttle)

- Mặc định toàn app: **100 000 request / 60 giây / IP** (`ThrottlerModule.forRoot([{ ttl: 60000, limit: 100000 }])`, `app.module.ts:79`). Thực tế coi như không giới hạn.
- Endpoint ghi đè bằng `@Throttle` (cùng tính theo IP, cửa sổ 60 giây):

| Endpoint | Giới hạn | Nguồn |
|---|---|---|
| `POST /api/v1/auth/login` | 20 / phút | `src/auth/auth.controller.ts:41` |
| `POST /api/v1/auth/refresh` | 30 / phút | `src/auth/auth.controller.ts:64` |
| `POST /api/v1/auth/change-password` | 10 / phút | `src/auth/auth.controller.ts:144` |
| `POST /api/v1/users/:userSlug/change-password` | 10 / phút | `src/user/user.controller.ts:114` |

- IP lấy từ `req.ip`. Khi `TRUST_PROXY_COUNT > 0` thì đọc qua `X-Forwarded-For` (`src/main.ts:24-27`).
- Bộ đếm lưu trong bộ nhớ của từng process, vì không cấu hình storage.
- `@nestjs/throttler@5.2.0` gửi header `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, và `Retry-After` khi bị 429. CORS không khai `exposedHeaders`, nên JS ở trình duyệt **không đọc được** các header này khi gọi khác origin.
- Lỗi: 429, message `"ThrottlerException: Too Many Requests"`, không có `code`.

## 11. CORS và biến cấu hình liên quan

| Biến | Dùng cho | Nguồn |
|---|---|---|
| `ALLOWED_ORIGINS` | Danh sách origin, phân tách bằng dấu phẩy, **không trim khoảng trắng**. Thiếu biến này thì app không khởi động | `src/config/cors.config.ts:4-11`, `src/app/env.validation.ts` |
| `VERSION` | Prefix `/api/${VERSION}` | `src/main.ts:18-19` |
| `PORT` | Cổng HTTP | `src/main.ts` |
| `DURATION` | Hạn access token (giây) | `src/auth/auth.service.ts` |
| `REFRESHABLE_DURATION` | Hạn refresh token (giây), cũng là TTL của key thu hồi | `src/auth/auth.service.ts`, `src/auth/token-revocation.service.ts` |
| `TRUST_PROXY_COUNT` | Số proxy tin cậy, ảnh hưởng `req.ip` | `src/main.ts:24` |
| `NODE_ENV` | `production` thì cookie session đặt `secure` | `src/config/session.config.ts:36` |

CORS: `origin` = danh sách trên, `credentials: true`. Không cấu hình `methods`/`allowedHeaders`/`exposedHeaders`, nên dùng mặc định của gói `cors`.

## 12. Mã lỗi

### 12.1 Cơ chế

- Mỗi module khai `<Module>Validation` trong `src/<module>/<module>.validation.ts` bằng `createErrorCode(code, message, statusCode = 422)` (`src/app/error-code.util.ts`).
- `AppValidation` (`src/app/app.validation.ts`) gộp tất cả các bảng. Lúc khởi động, nếu 2 key trùng **mã số** thì app ném lỗi và không chạy (`app.validation.ts:85-94`).
- Danh sách đầy đủ (key, code, message, statusCode) xem qua `GET /api/v1/error-codes` (public, không bọc envelope, `src/app/app.controller.ts`). Chi tiết ở [system.md](system.md).

### 12.2 Dải mã theo module (theo code hiện tại)

| Dải | Module | File | Số mã hiện có |
|---|---|---|---|
| 100001–100099 | auth | `src/auth/auth.validation.ts` | 11 (100001–100013, đã bỏ 100009, 100010, 100014, 100015, không tái dùng) |
| 100101–100199 | role | `src/role/role.validation.ts` | 6 |
| 100201–100299 | authority | `src/authority/authority.validation.ts` | 3 |
| 100301–100399 | authority-group | `src/authority-group/authority-group.validation.ts` | 1 |
| 100401–100499 | user | `src/user/user.validation.ts` | 22 |
| 100501–100599 | warehouse | `src/warehouse/warehouse.validation.ts` | 22 |
| 100601–100699 | material-type | `src/material-type/material-type.validation.ts` | 9 |
| 100701–100799 | material | `src/material/material.validation.ts` | 26 |
| 100800 | **chung** | `src/app/app-common.validation.ts` | `DATA_VERSION_CONFLICT` |
| 100801–100817 | inventory | `src/inventory/inventory.validation.ts` | 17 |
| 100850–100855 | **chung** (query) | `src/app/app-common.validation.ts` | 6 |
| 100901–100999 | unit | `src/unit/unit.validation.ts` | 8 |
| 101001–101099 | store | `src/store/store.validation.ts` | 18 |
| 101101–101199 | tax-profile | `src/tax-profile/tax-profile.validation.ts` | 7 |
| 101201–101299 | supplier | `src/supplier/supplier.validation.ts` | 23 |
| 101301–101399 | import-form | `src/import-form/import-form.validation.ts` | 33 |
| 101401–101499 | export-form | `src/export-form/export-form.validation.ts` | 39 |
| 101501–101599 | material-batch | `src/material-batch/material-batch.validation.ts` | 5 |
| 109000–109099 | db | `src/db/db.validation.ts` | 1 |
| 121000–122000 | file | `src/file/file.validation.ts` | 13 |
| 155501–156000 | notification | `src/notification/notification.validation.ts` | 4 |
| 999901–999904 | example (mẫu, không dành cho FE) | `src/example/example.validation.ts` | 4 |

Khoảng trăm của mỗi module là quy ước suy ra từ code, **không có văn bản quy định**. Chỉ `app-common` (100800–100900), `db`, `file`, `notification` ghi dải trong comment. Dải "chung" 100800–100900 khai trong comment lại chồng lên mã của inventory (100801–100817). Mã chung mới vì vậy được đặt ở 10085x (`app-common.validation.ts:24-31`).

### 12.3 Mã lỗi chung (`AppCommonValidation`)

Nguồn: `src/app/app-common.validation.ts:25-51`.

| Key | code | HTTP | message | Khi nào |
|---|---|---|---|---|
| `DATA_VERSION_CONFLICT` | 100800 | 409 | Data has been modified by another request, please reload and try again | Optimistic lock lệch `version` (mục 9) |
| `START_DATE_INVALID` | 100850 | 422 | startDate must be a valid date (YYYY-MM-DD or ISO 8601) | Query `startDate` sai dạng |
| `END_DATE_INVALID` | 100851 | 422 | endDate must be a valid date (YYYY-MM-DD or ISO 8601) | Query `endDate` sai dạng |
| `SORT_INVALID` | 100852 | 422 | sort must be ASC or DESC | Query `sort` khác `ASC`/`DESC` |
| `SORT_BY_INVALID` | 100853 | 422 | sortBy is not supported by this endpoint | `sortBy` ngoài enum của endpoint |
| `PAGE_INVALID` | 100854 | 422 | page must be an integer >= 1 | Query `page` |
| `SIZE_INVALID` | 100855 | 422 | size must be an integer between 1 and 500 | Query `size` |

## Ghi chú cho FE

- Rẽ nhánh lỗi bằng `code`, không bằng `message` hay HTTP status. Nhiều lỗi "không tìm thấy" trả **422** chứ không phải 404 (vd `ROLE_NOT_FOUND`, `AUTHORITY_NOT_FOUND`), trong khi `USER_NOT_FOUND` trả 404.
- Lỗi validation chỉ báo **1 field** mỗi lần (5.2). Muốn báo lỗi cho từng ô trên form thì FE phải tự validate trước.
- `createdAt`/`updatedAt` và `expireTime*` không phải ISO-8601 (mục 3, 6.2). Nếu cần hạn token chính xác, decode `exp` từ JWT, hoặc tính từ lúc nhận token cộng thời hạn đã biết.
- Không hardcode slug. Tìm role theo `name` (`SUPERVISOR`, `MANAGER`, `ADMIN`, `SUPER_ADMIN`), authority theo `code`.
- `hasPrevios` là tên field chính thức (sai chính tả có chủ ý).
- Lỗi 500 không có `timestamp/path/method/code` (5.4).
- README nói Swagger JSON ở `/api/api-docs/swagger.json`, nhưng theo code nó ở `/swagger.json` (mục 1, chưa xác minh bằng chạy).

# System (app, health, db, logger, feature flag)

> Nguồn: `src/app/app.controller.ts`, `src/app/app.service.ts`, `src/app/app.module.ts`, `src/main.ts`,
> `src/health/health.controller.ts`, `src/db/db.controller.ts`, `src/db/db.service.ts`, `src/db/db.validation.ts`,
> `src/logger/logger.controller.ts`, `src/logger/logger.dto.ts`, `src/logger/logger.service.ts`,
> `src/logger/logger.middleware.ts`, `src/feature-flag-system/**` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).
> Đối chiếu code tại `origin/main` 814c015.

## Tóm tắt endpoint

| Method | Path | Quyền (authority / role) | Dành cho | Mô tả |
|---|---|---|---|---|
| GET | /api/v1/hello | Public | Vận hành | Kiểm tra app sống, trả text thuần |
| GET | /api/v1/real-ip | Public | Vận hành / debug | IP client mà BE nhìn thấy |
| GET | /api/v1/error-codes | Public | FE (tuỳ chọn) | Toàn bộ bảng mã lỗi `AppValidation` |
| GET | /api/v1/health | Public | Vận hành | Healthcheck (app + Redis), ẩn khỏi Swagger |
| POST | /api/v1/db | `DB_BACKUP` | Vận hành | Tạo backup database |
| GET | /api/v1/logger | `LOGGER_READ` | Vận hành (màn quản trị nếu có) | Đọc log ứng dụng đã lưu vào DB, phân trang |

**FE nên dùng:** chỉ `GET /error-codes` là có ích cho FE (tra mã lỗi / message gốc). `GET /logger` chỉ dùng nếu
có màn quản trị xem log cho người có `LOGGER_READ`. Các endpoint còn lại dành cho vận hành; FE không nên gọi.
FE hiện (`warehouse-ui/src`) **không gọi** endpoint nào trong file này.

Ngoài `/api/v1` (không phải API nghiệp vụ, để tham khảo):
- Swagger UI: `/api/api-docs`, JSON: `/swagger.json` ở gốc (`src/main.ts:29-38` truyền `jsonDocumentUrl: 'swagger.json'`;
  `@nestjs/swagger` 7.4.2 đặt URL này **tương đối với gốc**, không với `/api/api-docs`, vì `useGlobalPrefix` không bật —
  đọc từ `node_modules/@nestjs/swagger/dist/swagger-module.js:155-157`, chưa xác minh bằng chạy thật).
  `/health` bị `@ApiExcludeController` nên không có trong Swagger.

`src/example` (`/api/v1/examples`, 5 route CRUD) là module mẫu để scaffold, **vẫn được đăng ký trong `AppModule`**
(`src/app/app.module.ts:88`) nên route đang chạy thật, nhưng **không dành cho FE**.

## GET /api/v1/hello

- **Quyền:** `@Public()` (`app.controller.ts:12-16`).
- **Response 200:** body là **chuỗi thuần** `warehouse-api is running` (`app.service.ts:6`), **không** bọc envelope
  `AppResponseDto` (interceptor bỏ qua giá trị không phải object, `src/role/role.interceptor.ts:16`).
  Content-Type do Express quyết định cho string (thường `text/html`; chưa xác minh bằng chạy thật).
- **Lỗi riêng:** không có.
- Được `GET /health` gọi nội bộ để ping app (`health.controller.ts:44-48`).

## GET /api/v1/real-ip

- **Quyền:** `@Public()` (`app.controller.ts:18-22`).
- **Response 200:** object **không bọc envelope**: `{ "ip": "<string>" }` lấy từ `@Ip()` (= `req.ip` của Express).
  Kết quả phụ thuộc biến môi trường `TRUST_PROXY_COUNT` (`src/main.ts:24-27`): bằng 0 (mặc định) thì là IP của
  proxy gần nhất.
- **Lỗi riêng:** không có.

## GET /api/v1/error-codes

- **Quyền:** `@Public()` (`app.controller.ts:24-33`).
- **Response 200:** **mảng không bọc envelope**, mỗi phần tử là 1 entry của `AppValidation`
  (gộp mã lỗi của mọi module, `src/app/app.validation.ts:40-81`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `key` | string | Tên key, vd `FILE_TYPE_NOT_ALLOWED` |
| `code` | number | Mã lỗi số trả về ở field `code` của response lỗi |
| `message` | string | Message gốc (tiếng Anh) |
| `statusCode` | number | HTTP status của lỗi đó (mặc định 422) |

```json
[
  { "key": "FILE_NOT_FOUND", "code": 121000, "message": "File not found", "statusCode": 422 }
]
```

- **Lỗi riêng:** không có.
- Bảng chỉ gồm lỗi có `code`. Lỗi không có `code` (401/403 của guard, 400 validation message tự do, 500) không nằm ở đây.

## GET /api/v1/health

- **Quyền:** `@Public()` (`health.controller.ts:39-42`). Ẩn khỏi Swagger (`health.controller.ts:16`).
- **Kiểm tra** (`health.controller.ts:43-50`):
  - `warehouse-api`: HTTP ping `http://localhost:<PORT>/api/<VERSION>/hello`.
  - `redis`: `RedisService.ping()` (`health.controller.ts:29-37`). Comment trong code: Redis chết thì mọi request có JWT
    bị 401, nên health phải đỏ.
- **Response 200** (format của `@nestjs/terminus`, không bọc envelope):

```json
{
  "status": "ok",
  "info": { "warehouse-api": { "status": "up" }, "redis": { "status": "up" } },
  "error": {},
  "details": { "warehouse-api": { "status": "up" }, "redis": { "status": "up" } }
}
```

- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 503 | — | 1 trong 2 check lỗi. Terminus ném `ServiceUnavailableException(result)`; `HttpExceptionFilter` (`src/app/http-exception.filter.ts:17-51`) bắt mọi `HttpException` và viết lại body thành envelope lỗi chung với `message` = `Service Unavailable Exception`. Vì vậy **chi tiết check nào hỏng bị mất** khỏi response (suy ra từ code, chưa xác minh bằng chạy thật) |

## POST /api/v1/db

- **Quyền:** cần JWT + authority `DB_BACKUP` (`db.controller.ts:14-15`). Migration seed
  `src/migrations/1783728000009-seed-authority-permission.ts:57-63,81-92` cấp `DB_BACKUP` cho role `ADMIN`.
- **Body:** không có.
- **Hành vi:** tạo một bản backup database trên server (`db.service.ts`). Endpoint dành cho vận hành, FE không dùng.
- **Response 201** (POST không có `@HttpCode` → mặc định 201). Không có `result`; `message` là chuỗi thông báo
  (`db.controller.ts:17-22`):

```json
{
  "message": "Database backup created at <...>",
  "statusCode": 201,
  "timestamp": "2026-11-07T03:00:00.000Z"
}
```

- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 109000 `EXPORT_DATABASE_ERROR` | Tạo backup thất bại (`db.service.ts:39-43`) |

## GET /api/v1/logger

- **Quyền:** cần JWT + authority `LOGGER_READ` (`logger.controller.ts:16-17`). Migration
  `1783728000009-seed-authority-permission.ts:64-70,81-92` cấp `LOGGER_READ` cho role `ADMIN`.
- **Query** (`GetLoggerRequestDto` kế thừa `BaseQueryDto`, `logger.dto.ts:28-38`;
  `ValidationPipe({ transform: true, whitelist: true })`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `page` | number (int ≥ 1) | Không | mặc định 1 | Sai → `PAGE_INVALID` (conventions.md) |
| `size` | number (int 1–500) | Không | mặc định 10 | Sai → `SIZE_INVALID` |
| `level` | string | Không | **không validate** (Swagger ghi `info`/`warn`/`error`/`debug` nhưng code không có `@IsEnum`) | So khớp chính xác cột `level`; giá trị lạ → danh sách rỗng |
| `sort`, `startDate`, `endDate` | — | Không | được validate theo `BaseQueryDto` | **Không được dùng**: luôn sắp `createdAt DESC`, không lọc ngày (`logger.service.ts:21-26`) |

- **Response 200:** `result` là trang phân trang (conventions.md), `items` là `LoggerResponseDto`
  (`logger.dto.ts:6-26`). Message: `All logs have been retrieved successfully`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug` | string | |
| `createdAt` | string | xem conventions.md |
| `updatedAt` | string | |
| `level` | string | Mức log của winston (`info`, `warn`, `error`, ...) |
| `message` | string | Nội dung log |
| `context` | string \| null | Tên class/hàm ghi log |
| `timestamp` | string | Do winston gắn (`src/config/logger.config.ts:10`) |
| `pid` | number | PID tiến trình Node |

- **Lỗi riêng:** không có ngoài lỗi query chung.
- Log cũ hơn 1 tuần bị xoá lúc 23:00 hằng ngày (`logger.scheduler.ts:16-29`).

## Feature flag (`FeatureGuard`)

- `FeatureGuard` là guard global (`src/app/app.module.ts:118`), đọc metadata `@Feature('<key>')`
  (`src/feature-flag-system/feature.decorator.ts:3-5`, key dạng `group:feature:child`).
- **Hiện không có route nào gắn `@Feature(...)`** (đã grep `src/`), và `FeatureFlagSystemService.isEnabled()` **luôn trả
  `true`** (`feature-flag-system.service.ts:3-9`, comment: chưa có bảng/admin UI cho feature flag). Vậy hiện tại
  **FE không gặp feature flag nào**.
- Nếu sau này có flag bị tắt: guard ném `ForbiddenException` (`guard/fureture.guard.ts:20-22`) → **403 không có `code`**,
  `message` = `Feature "<key>" is currently disabled`. FE phân biệt với 403 thiếu quyền chỉ bằng `message`.
- **Không có endpoint** để FE biết flag nào đang bật.

## Middleware log (`x-trace-id`)

`LoggerMiddleware` áp cho mọi route (`src/app/app.module.ts:123-125`): nếu request không có header `x-trace-id` thì BE
tự gán UUID vào **header của request** (`logger.middleware.ts:8`). Header này **không được trả lại** trong response
và không được dùng ở nơi khác trong `src/` (đã grep). FE gửi `x-trace-id` cũng không có tác dụng quan sát được.

## Mã lỗi của module

Chỉ `db` có file validation (`src/db/db.validation.ts:10-12`). `app.controller`, `health`, `logger`,
`feature-flag-system` không có mã lỗi riêng.

| Key | code | HTTP | message |
|---|---|---|---|
| `EXPORT_DATABASE_ERROR` | 109000 | 422 | Export database error |

## Ghi chú cho FE

- `/hello`, `/real-ip`, `/error-codes`, `/health` **không** dùng envelope `AppResponseDto` (không có `result`,
  `message`, `statusCode`) — đừng gọi qua helper chỉ đọc `result`.
- `/error-codes` là nguồn chuẩn để đối chiếu bảng mã lỗi FE đang hardcode (vd. `warehouse-ui/src/shared/api/error-codes.ts`).
- 403 do feature flag và 403 do thiếu authority đều không có `code`; hiện không có flag nào nên chưa cần xử lý riêng.

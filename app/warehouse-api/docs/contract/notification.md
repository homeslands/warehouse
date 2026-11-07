# Notification (thông báo)

> Nguồn: `src/notification/notification.controller.ts`, `notification.dto.ts`, `notification.service.ts`,
> `notification.entity.ts`, `notification.mapper.ts`, `notification.validation.ts`,
> `src/notification/firebase/*` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).
> Đối chiếu code tại `origin/main` 5555273.

## Tóm tắt endpoint

| Method | Path | Quyền (authority / role) | Mô tả |
|---|---|---|---|
| GET | /api/v1/notification | **Public** (không cần đăng nhập) | Danh sách thông báo, phân trang |
| PATCH | /api/v1/notification/:slug/read | Đăng nhập (không cần authority) | Đánh dấu 1 thông báo đã đọc |
| POST | /api/v1/notification/firebase/register-device-token | Đăng nhập (không cần authority) | Đăng ký FCM device token cho user hiện tại |
| DELETE | /api/v1/notification/firebase/unregister-device-token/:token | Đăng nhập (không cần authority) | Huỷ đăng ký FCM device token |

Không endpoint nào có `@RequireAuthority`, `@HasRole`, warehouse scope hay feature flag
(`notification.controller.ts:26-90`). "Đăng nhập" = route không `@Public()` nên `JwtOptionalAuthGuard` bắt buộc JWT
(`src/auth/passport/jwt/jwt-optional-auth.guard.ts:32-38`).

## Realtime

- **Không có WebSocket, Socket.IO hay SSE.** Không có `@WebSocketGateway`/`@Sse` nào trong `src/`, `package.json`
  không có thư viện socket.
- Kênh đẩy duy nhất là **Firebase Cloud Messaging (FCM)** qua `firebase-admin` (`firebase/firebase.service.ts`).
  Khi BE tạo thông báo (`NotificationService.create`, `notification.service.ts:57-140`), nó gửi push tới mọi device
  token của `receiverId`. Payload FCM (`notification.service.ts:98-115`):
  - `notification.title` / `notification.body`: lấy từ `title` / `body` của thông báo (rỗng nếu null).
  - `data.payload`: **chuỗi JSON** gồm `slug`, `type`, `message`, `senderId`, `receiverId`, `createdAt` (ISO),
    `sentAt` (ISO), `route` (= `link`), cộng thêm mọi key trong `metadata`.
  - Với platform `web`: `webpush.fcmOptions.link = link || '/'`, icon `/logo192.png`, badge `/badge.png`
    (`firebase/firebase.service.ts:65-75`).
- Token gửi lỗi được BE tự xoá khỏi DB (`notification.service.ts:119-129`).
- **Hiện không có code nào tạo thông báo:** `NotificationProducer`/`NotificationService.create` không được gọi từ
  module nào ngoài `src/notification/` (đã grep). Thực tế bảng thông báo chỉ có dữ liệu nếu được chèn từ nơi khác.

## GET /api/v1/notification

- **Quyền:** `@Public()` (`notification.controller.ts:34`) — gọi được **không cần token**.
- **Query** (`GetAllNotificationDto` kế thừa `BaseQueryDto`, `notification.dto.ts:97-116`, `src/app/base.dto.ts:20-74`;
  `ValidationPipe({ transform: true, whitelist: true })` — query lạ bị bỏ qua, không báo lỗi):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `page` | number (int ≥ 1) | Không | mặc định 1 | Sai → `PAGE_INVALID` (conventions.md) |
| `size` | number (int 1–500) | Không | mặc định 10 | Sai → `SIZE_INVALID` |
| `receiver` | string (slug user) | Không | — | Slug của user nhận. FE **luôn** truyền slug của user đang đăng nhập |
| `isRead` | `'true'` \| `'false'` | Không | — | Chỉ `'true'` có tác dụng. `'false'` (hoặc giá trị khác) thành `false` và **bị bỏ qua** do `if (options.isRead)` (`notification.service.ts:195`) — không lọc được "chưa đọc" |
| `type` | string | Không | — | So khớp chính xác `type` |
| `sort`, `startDate`, `endDate` | — | Không | được validate theo `BaseQueryDto` | **Không được dùng** trong service: luôn sắp `createdAt DESC`, không lọc ngày (`notification.service.ts:180-184`) |

- **Response 200:** `result` là trang phân trang (`items`, `total`, `page`, `pageSize`, `totalPages`, `hasNext`,
  `hasPrevios` — xem conventions.md), `items` là mảng `NotificationResponseDto`:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug` | string | Định danh public (`src/app/base.dto.ts:76-88`) |
| `createdAt` | string | Định dạng ngày theo `baseMapper` — xem conventions.md |
| `updatedAt` | string | như trên |
| `message` | string | Nội dung hiển thị trên UI (`notification.entity.ts:24-27`) |
| `senderId` | string \| null | Giá trị lưu ở `sender_id_column` (VARCHAR(36), có thể null) |
| `receiverId` | string | Giá trị lưu ở `receiver_id_column`. Service dùng nó để tra device token theo `userId` (= `id` uuid của user), nên đây là **id nội bộ của user**, không phải slug |
| `type` | string | Chuỗi tự do, không có enum trong code |
| `isRead` | boolean | |
| `link` | string \| null | |
| `metadata` | `any` | Mapper ghi `JSON.stringify(metadata)` vào cột `JSON` (`notification.mapper.ts:32-40`). Kiểu thực tế khi đọc ra (object hay chuỗi JSON) **chưa xác minh** |

Các cột `title`, `body`, `language`, `senderName`, `receiverName` **không có** trong response
(`notification.dto.ts:67-95`). Message thành công: `Get all notifications successfully`.

- **Lỗi riêng:** không có lỗi riêng ngoài lỗi query chung (`PAGE_INVALID`, `SIZE_INVALID`, `SORT_INVALID`,
  `START_DATE_INVALID`, `END_DATE_INVALID` — conventions.md).

## PATCH /api/v1/notification/:slug/read

- **Quyền:** cần JWT, không cần authority (`notification.controller.ts:49-60`). FE chỉ gọi với thông báo của
  user đang đăng nhập.
- **Path params:**

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `slug` | string (slug) | Có | — | Slug thông báo |

- **Body:** không có.
- **Response 200:** `result` là 1 `NotificationResponseDto` (bảng ở trên) với `isRead: true`.
  Message: `Notification has been read successfully`. Gọi lại trên thông báo đã đọc vẫn 200.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 155501 `NOTIFICATION_NOT_FOUND` | Không có thông báo với `slug` này (hoặc đã soft-delete) (`notification.service.ts:47-49`) |

## POST /api/v1/notification/firebase/register-device-token

- **Quyền:** cần JWT, không cần authority (`notification.controller.ts:62-77`). Token được gắn với `userId` của
  user hiện tại.
- **Body** (`FirebaseRegisterDeviceTokenRequestDto`, `notification.dto.ts:118-136`;
  `ValidationPipe({ transform: true, whitelist: true })`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `token` | string | Có | `@IsNotEmpty` (không có `@IsString`/`@MaxLength`) | FCM registration token. Cột DB `VARCHAR(255)` unique (`src/migrations/1783728000007-create-firebase-device-token-table.ts:12,21`) |
| `platform` | `'ios'` \| `'android'` \| `'web'` | Có | `@IsNotEmpty`, `@IsEnum(FirebasePlatform)` | `firebase/firebase.constant.ts:1-5` |
| `userAgent` | string | Không | không giới hạn độ dài trong DTO | Cột DB `VARCHAR(255)` (`...000007...ts:14`) |

- **Hành vi:** đăng ký token thiết bị cho user hiện tại, cập nhật `platform`, `userAgent` nếu token đã có
  (`notification.service.ts:142-166`). Gọi lặp lại an toàn.
- **Response 200** (`@HttpCode(200)`, không phải 201): `result` là `FirebaseRegisterDeviceTokenResponseDto`
  (`notification.dto.ts:138-142`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug` | string | slug của bản ghi device token |
| `createdAt` | string | xem conventions.md |
| `updatedAt` | string | |
| `platform` | string | |

  Message: `Device token registered successfully`. Token không được trả lại.
- **Lỗi riêng:** validation của DTO này dùng message **tự do**, không phải key trong `AppValidation`, nên
  `HttpExceptionFilter` trả **400 không có `code`** với `message` là message đầu tiên
  (`src/app/http-exception.filter.ts:28-42`):

| HTTP | code | Khi nào |
|---|---|---|
| 400 | — | `token` rỗng/thiếu → message `Firebase token is required` |
| 400 | — | `platform` không thuộc `ios`/`android`/`web` → message `Platform must be one of the following: ios, android, web` |
| 400 | — | `platform` thiếu → một trong hai message `platform should not be empty` hoặc message `@IsEnum` ở trên (thứ tự **chưa xác minh**) |
| 500 | — | `token`/`userAgent` dài hơn 255 ký tự: lỗi DB, không được validate trước (**chưa xác minh** bằng chạy thật; phụ thuộc SQL mode của MySQL) |

## DELETE /api/v1/notification/firebase/unregister-device-token/:token

- **Quyền:** cần JWT, không cần authority (`notification.controller.ts:79-89`). FE chỉ gỡ token của thiết bị hiện tại.
- **Path params:**

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `token` | string | Có | — | FCM token. FE nên `encodeURIComponent` khi ghép vào URL |

- **Body:** không có.
- **Response:** HTTP **200** (`@HttpCode(HttpStatus.OK)`), nhưng field `statusCode` trong body là **204**
  (`notification.controller.ts:84-88`). Không có `result`. Message: `Device token unregistered successfully`.
  Token không tồn tại vẫn trả 200 (không ném lỗi).
- **Lỗi riêng:** không có.

## Mã lỗi của module

Toàn bộ `src/notification/notification.validation.ts:17-22` (HTTP mặc định 422 của `createErrorCode`).

| Key | code | HTTP | message |
|---|---|---|---|
| `NOTIFICATION_NOT_FOUND` | 155501 | 422 | Notification not found |
| `SENDER_NOT_FOUND` | 155502 | 422 | Sender not found |
| `RECEIVER_NOT_FOUND` | 155503 | 422 | Receiver not found |
| `NOTIFICATION_CREATE_FAILED` | 155504 | 422 | Notification create failed |

Chỉ `NOTIFICATION_NOT_FOUND` được ném trong code hiện tại; 155502–155504 khai báo nhưng không dùng.

## Ghi chú cho FE

- FE (`warehouse-ui/src`) hiện **không gọi** endpoint nào của module này.
- Gọi `GET /notification` luôn kèm `receiver` = slug user hiện tại và gửi kèm token.
- Không lọc được "chưa đọc" (`isRead=false` bị bỏ qua). Muốn đếm chưa đọc phải tự lọc phía client (chưa có
  endpoint đếm).
- `PATCH .../read` dùng **slug** thông báo, trả lỗi 422 (không phải 404) khi không tìm thấy.
- `receiverId`/`senderId` là id nội bộ (uuid) chứ không phải slug, trái với quy ước "chỉ lộ slug" ở các module khác.
- Không có realtime qua socket; muốn nhận push thì đăng ký FCM token (web cần service worker Firebase phía FE —
  cấu hình Firebase phía FE ngoài phạm vi tài liệu này).
- Khi logout, gọi `DELETE .../unregister-device-token/:token` để thiết bị không nhận push của user cũ; nếu không,
  token vẫn gắn với user cũ cho đến khi user khác đăng ký lại cùng token.

# Auth

> Nguồn: `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, `src/auth/auth.dto.ts`, `src/auth/auth.validation.ts`, `src/auth/auth.utils.ts`, `src/auth/token-revocation.service.ts`, `src/auth/passport/jwt/*`, `src/user/user.decorator.ts`, `src/user/user.service.ts` (`findWarehousesOfUser`) (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).

## Tóm tắt endpoint

| Method | Path | Quyền (authority / role) | Mô tả |
|---|---|---|---|
| GET | /api/v1/auth/me | Đã đăng nhập | Thông tin user hiện tại, `scope`, các kho của user |
| POST | /api/v1/auth/login | Public, 20 req/phút/IP | Đăng nhập bằng số điện thoại và mật khẩu |
| POST | /api/v1/auth/refresh | Public, 30 req/phút/IP | Đổi refresh token lấy cặp token mới |
| POST | /api/v1/auth/logout | Đã đăng nhập | Thu hồi phiên hiện tại |
| POST | /api/v1/auth/logout-all | Đã đăng nhập | Thu hồi mọi phiên của chính mình |
| POST | /api/v1/auth/change-password | Đã đăng nhập, 10 req/phút/IP | Tự đổi mật khẩu của mình |

Không endpoint nào ở đây dùng `@RequireAuthority`, `@HasRole`, `@WarehouseScope` hay `@Feature`.

### Dạng token trả về: `LoginAuthResponseDto`

Dùng chung cho `login`, `refresh` và `change-password` (`result.tokens`). Nguồn: `src/auth/auth.dto.ts` (`LoginAuthResponseDto`), `src/auth/auth.service.ts` (`buildTokenPair`).

| Field | Kiểu | Ghi chú |
|---|---|---|
| `accessToken` | `string (JWT)` | Hạn `DURATION` giây (`.env.example`: 900). Claim: `sub`, `jti`, `sid`, `role`, `type: "access"`, `exp`, `iat` |
| `expireTime` | `string` | `moment().add(DURATION, 's').toString()`, vd `"Thu Sep 04 2026 10:15:00 GMT+0700"`. **Không phải ISO**, theo giờ server |
| `refreshToken` | `string (JWT)` | Hạn `REFRESHABLE_DURATION` giây (`.env.example`: 2592000 = 30 ngày). Claim: `sub`, `jti`, `sid`, `type: "refresh"`, `exp`, `iat` (không có `role`) |
| `expireTimeRefreshToken` | `string` | Như `expireTime`, cho refresh token |

## GET /api/v1/auth/me

- **Quyền:** cần access token hợp lệ, không cần authority.
- **Path params / Query:** không có.
- **Body:** không có.
- **Response 200:** `result` có dạng `ProfileResponseDto` (`src/auth/auth.dto.ts`, dựng ở `AuthService.getProfile`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `roleName` | `string?` | Claim `role` của access token, vd `"ADMIN"`. Vắng mặt nếu token được phát trước khi có claim này |
| `sessionId` | `string?` | Claim `sid`, cố định suốt vòng đời một phiên (không đổi khi refresh) |
| `scope` | `string[]` | Các `Authority.code` của role, lấy từ cache RBAC. `SUPER_ADMIN` thường là `[]` nhưng vẫn có mọi quyền ([conventions.md §7.2](conventions.md#72-mô-hình-quyền-mà-fe-cần-biết)) |
| `userSlug` | `string (slug)` | Định danh public của user |
| `userName` | `string` | Giữ cho client cũ, bằng `phonenumber` |
| `phonenumber` | `string` | |
| `firstName` | `string` | |
| `lastName` | `string` | |
| `email` | `string \| null` | Lấy thẳng từ entity. Cột rỗng sẽ ra `null` |
| `dob` | `string (YYYY-MM-DD) \| null` | |
| `address` | `string \| null` | |
| `role` | `{ slug, name, description, level }?` | Vắng mặt nếu user không có role. `level` là số, càng lớn càng cao cấp |
| `warehouses` | `Array<{ slug, code, name, isManager }>` | Các kho user làm manager (`isManager: true`) hoặc là member (`false`). Sắp theo `name` tăng dần. `[]` nếu không thuộc kho nào (vd ADMIN) |

`email/dob/address` ra `null` là suy luận từ cách TypeORM trả cột NULL, **chưa xác minh bằng chạy thật**. Response **không có** `userId` (uuid).

- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100405 `USER_NOT_FOUND` | Token còn hợp lệ nhưng user không còn trong DB. Hiếm gặp, vì `DELETE /users/:userSlug` đã thu hồi mọi token của user (khi đó nhận 401 trước) |

## POST /api/v1/auth/login

- **Quyền:** `@Public()`, `@Throttle` 20 req / 60 giây / IP (`auth.controller.ts:39-41`).
- **Body:** `LoginAuthRequestDto`

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `phonenumber` | `string` | có | `@IsNotEmpty`. **Không** kiểm định dạng số điện thoại | Không trim. Tài khoản root dùng giá trị `ROOT_PHONENUMBER` (mặc định `root`) |
| `password` | `string` | có | `@IsNotEmpty` | |

- **Response 200:** `result` có dạng `LoginAuthResponseDto` (xem trên). Mỗi lần login tạo một `sid` mới, tức một phiên mới.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100006 `PHONENUMBER_IS_REQUIRED` | Thiếu hoặc rỗng `phonenumber` |
| 400 | 100007 `PASSWORD_IS_REQUIRED` | Thiếu hoặc rỗng `password` |
| 401 | 100001 `INVALID_CREDENTIALS` | Không có user với số điện thoại này (gồm cả user đã xoá mềm), sai mật khẩu, hoặc số điện thoại là `default-customer` |
| 403 | 100002 `USER_NOT_ACTIVE` | Đúng mật khẩu nhưng tài khoản đang bị khoá. Mật khẩu sai thì vẫn trả 100001 |
| 429 | — | Vượt 20 req/phút |

## POST /api/v1/auth/refresh

- **Quyền:** `@Public()`, `@Throttle` 30 req / 60 giây / IP. Không cần header `Authorization`.
- **Body:** `RefreshAuthRequestDto`

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `refreshToken` | `string` | có | `@IsNotEmpty` | Refresh token của lần login/refresh gần nhất |

- **Response 200:** `result` là cặp token mới `LoginAuthResponseDto`:
  - Giữ nguyên `sid`.
  - Access token mới mang `role` **đọc lại từ DB**, nên phản ánh role hiện tại.
  - Refresh token mới có hạn đầy đủ `REFRESHABLE_DURATION`, tính từ lúc gọi. Nghĩa là phiên có thể kéo dài mãi nếu cứ refresh trước khi hết hạn.
  - **Không xoay vòng:** refresh token cũ vẫn dùng được tới `exp` của nó. Muốn vô hiệu ngay thì gọi `logout`/`logout-all`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100008 `REFRESH_TOKEN_IS_REQUIRED` | Thiếu hoặc rỗng `refreshToken` |
| 401 | 100004 `REFRESH_TOKEN_EXPIRED` | JWT hết hạn |
| 401 | 100003 `INVALID_REFRESH_TOKEN` | Sai chữ ký hoặc sai dạng; gửi access token thay cho refresh token (`type` khác `refresh`); token không có `sid`; user không còn tồn tại |
| 401 | 100005 `REFRESH_TOKEN_REVOKED` | Phiên đã bị thu hồi (logout, logout-all, đổi mật khẩu, khoá, xoá, đổi role), **hoặc Redis lỗi** (fail-closed) |
| 403 | 100002 `USER_NOT_ACTIVE` | User đã bị khoá. Server đồng thời thu hồi mọi token khác của user này |
| 429 | — | Vượt 30 req/phút |

## POST /api/v1/auth/logout

- **Quyền:** cần access token **còn hạn và chưa bị thu hồi**. Access token đã hết hạn thì nhận 401 và không logout được. FE nên refresh trước, hoặc chỉ xoá token phía client.
- **Body:** không có.
- **Response 200:** `result` có dạng `LogoutAuthResponseDto`

| Field | Kiểu | Ghi chú |
|---|---|---|
| `revokedSessions` | `0 \| 1` | `1` = đã ghi key thu hồi cho `sid` hiện tại. `0` = token không có claim `sid` (token cũ), không thu hồi được gì |

Sau khi gọi, cả access lẫn refresh token của phiên này đều bị từ chối ngay ở request kế tiếp (401 / 100005).

- **Lỗi riêng:** không có mã riêng. Redis lỗi khi ghi key thì trả 500 (không có `code`).

## POST /api/v1/auth/logout-all

- **Quyền:** cần access token hợp lệ.
- **Body:** không có.
- **Response 200:** `result` = `{ "revokedSessions": 1 }` (luôn là `1`).
- Thu hồi mọi token của user có `iat` trước thời điểm gọi, trên mọi thiết bị, và thu hồi thêm `sid` hiện tại. Đăng nhập lại sau đó hoạt động bình thường.
- **Lỗi riêng:** không có. Redis lỗi thì trả 500.

## POST /api/v1/auth/change-password

- **Quyền:** cần access token hợp lệ. `@Throttle` 10 req / 60 giây / IP. Chỉ đổi mật khẩu **của chính mình**. Đổi hộ người khác thì dùng `POST /api/v1/users/:userSlug/change-password` ([users-rbac.md](users-rbac.md)).
- **Body:** `ChangePasswordRequestDto`

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `currentPassword` | `string` | có | `@IsNotEmpty` | Mật khẩu hiện tại |
| `newPassword` | `string` | có | `@IsNotEmpty` | Không có quy tắc độ dài hay độ mạnh. Trùng mật khẩu cũ vẫn được chấp nhận |

Lỗi được kiểm tra theo thứ tự field trong DTO (`currentPassword` trước). Vì filter chỉ trả lỗi đầu tiên, thiếu cả hai field thì nhận 100012. Thứ tự này **chưa xác minh bằng test**.

- **Response 200:** `result` có dạng `ChangePasswordResponseDto`

| Field | Kiểu | Ghi chú |
|---|---|---|
| `tokens` | `LoginAuthResponseDto` | Cặp token mới với `sid` **mới** |

Sau khi đổi, **mọi phiên cũ** của user bị thu hồi, kể cả phiên đang gọi. FE phải thay ngay cả access và refresh token bằng `result.tokens`, nếu không request kế tiếp sẽ bị 401.

- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100012 `CURRENT_PASSWORD_IS_REQUIRED` | Thiếu hoặc rỗng `currentPassword` |
| 400 | 100011 `NEW_PASSWORD_IS_REQUIRED` | Thiếu hoặc rỗng `newPassword` |
| 422 | 100013 `CURRENT_PASSWORD_INCORRECT` | Sai mật khẩu hiện tại. **Cố ý không dùng 401**, để interceptor FE không tưởng phiên hết hạn |
| 404 | 100405 `USER_NOT_FOUND` | User không còn trong DB |
| 429 | — | Vượt 10 req/phút |

## Mã lỗi của module

Toàn bộ `AuthValidation` (`src/auth/auth.validation.ts`):

| Key | code | HTTP | message |
|---|---|---|---|
| `INVALID_CREDENTIALS` | 100001 | 401 | Invalid phone number or password |
| `USER_NOT_ACTIVE` | 100002 | 403 | User is not active |
| `INVALID_REFRESH_TOKEN` | 100003 | 401 | Invalid refresh token |
| `REFRESH_TOKEN_EXPIRED` | 100004 | 401 | Refresh token has expired |
| `REFRESH_TOKEN_REVOKED` | 100005 | 401 | Session has been revoked, please login again |
| `PHONENUMBER_IS_REQUIRED` | 100006 | 400 | Phone number is required |
| `PASSWORD_IS_REQUIRED` | 100007 | 400 | Password is required |
| `REFRESH_TOKEN_IS_REQUIRED` | 100008 | 400 | Refresh token is required |
| `NEW_PASSWORD_IS_REQUIRED` | 100011 | 400 | New password is required |
| `CURRENT_PASSWORD_IS_REQUIRED` | 100012 | 400 | Current password is required when changing your own password |
| `CURRENT_PASSWORD_INCORRECT` | 100013 | 422 | Current password is incorrect |

Đã bỏ và không tái dùng: 100009 (`REFRESH_TOKEN_REUSED`), 100010 (`SESSION_EXPIRED`). 100014 và 100015 đã chuyển sang `UserValidation` (comment trong `auth.validation.ts`).

## Ghi chú cho FE

- **Luồng phiên đề xuất** (khớp với code):
  1. `login`: lưu `accessToken` và `refreshToken`.
  2. Gọi API kèm header `Authorization: Bearer <accessToken>`.
  3. Gặp 401 không có `code`: gọi `refresh` **một lần** (gom các request song song), cập nhật cả 2 token, rồi gửi lại request.
  4. `refresh` trả 401 (100003/100004/100005) hoặc 403 (100002): xoá token và đưa về màn login.
- Không có cookie hay session server. Đóng tab rồi mở lại thì FE phải tự giữ token (xem [conventions.md §6.1](conventions.md#61-gửi-token)).
- Sau `change-password`, phải thay token bằng `result.tokens` ngay.
- Sau khi admin đổi role, khoá, xoá hoặc đổi mật khẩu hộ một user, mọi phiên của user đó bị thu hồi. Request kế tiếp của họ nhận 401, refresh nhận 100005 (hoặc 100002 nếu bị khoá).
- `scope` trong `/auth/me` là bản chụp tại thời điểm gọi. Sau khi bật hoặc tắt quyền của role, gọi lại `/auth/me` để cập nhật UI.
- `expireTime*` không phải ISO-8601 (xem [conventions.md §6.2](conventions.md#62-access-token-và-refresh-token)).
- Throttle tính theo IP. Nhiều người dùng chung một NAT có thể cùng chạm giới hạn 20 lần login mỗi phút.

# Đề xuất: hồ sơ người dùng và quản lý phiên đăng nhập

- Người đề xuất: frontend (warehouse-ui)
- Ngày: 2026-09-23
- Trạng thái: chờ backend xem xét

## Hiện tại

Bảng `user_tbl` (`src/user/user.entity.ts`) có đúng bốn cột nghiệp vụ:

| Cột | Ghi chú |
|---|---|
| `phonenumber` | `unique` — đồng thời là **tên đăng nhập** |
| `password` | bcrypt |
| `isActive` | |
| `role` | `ManyToOne` tới `Role` |

Không có họ tên, email, ảnh đại diện.

`GET /auth/me` trả `ProfileResponseDto = CurrentUserDto & { userName }`, và `userName` thực chất là
`user.phonenumber` (`auth.service.ts:54`). Nhưng cột `phonenumber` chứa **định danh đăng nhập bất kỳ**,
không nhất thiết là số điện thoại — tài khoản seed mặc định có `phonenumber = 'root'`
(`root-user.seeder.ts:20`, lấy từ `ROOT_PHONENUMBER`). Payload thật:

```jsonc
{
  "userId": "7513f603-…",
  "roleName": "SUPER_ADMIN",
  "sessionId": "37f5eb91-…",
  "scope": [],          // MẢNG ở đây, nhưng claim `scope` trong JWT là chuỗi JSON "[]"
  "userName": "root"    // = cột phonenumber
}
```

Hai điểm frontend phải xử lý riêng vì thế: không gắn nhãn "số điện thoại" cho `userName`, và không
dùng chung kiểu `scope` giữa dữ liệu đọc từ token với dữ liệu từ endpoint này.

`UserController` chỉ có `POST /users` (tạo, Admin), `GET /users` (danh sách, Admin),
`POST /users/:userSlug/change-password` (Admin/Manager). **Không có `PATCH`/`PUT` nào** — hiện không
ai sửa được thông tin người dùng, kể cả tự sửa của chính mình.

Hệ quả: frontend không thể làm màn "thông tin tài khoản" đúng nghĩa. Thứ duy nhất dựng được là bày
lại ba thao tác đã có (`change-password`, `logout`, `logout-all`) cho rộng rãi hơn.

## Đề xuất

### 1. Thêm trường hồ sơ vào `user_tbl`

```
fullName   varchar(100)  NULL
email      varchar(255)  NULL, unique khi khác NULL
```

Để `NULL` được vì đã có dữ liệu thật; không đặt mặc định là chuỗi rỗng (`@IsOptional()` của backend
bỏ qua `undefined`/`null` nhưng **vẫn chạy validator với `''`** — email rỗng sẽ trượt `@IsEmail`).

`GET /auth/me` bổ sung `fullName`, `email`, `isActive` (và `version`, xem mục 2). Frontend sẽ hiện `fullName` khi có và lùi về
`phonenumber` khi chưa có, nên việc triển khai không cần backfill dữ liệu.

### 2. `PATCH /auth/me` — tự sửa hồ sơ

```jsonc
// Request
{ "fullName": "Nguyễn Văn A", "email": "a@cmsiot.net", "version": 3 }
// Response: AppResponseDto<ProfileResponseDto>
```

- Chỉ sửa được `fullName` và `email`. **Không** cho sửa `role`, `isActive`, `password` qua đây.
- Gửi kèm `version` như mọi endpoint ghi khác trong hệ thống → lệch thì `409` mã `100800`.
  **Kèm theo: `GET /auth/me` phải trả thêm `version`** — hiện response không có, nên frontend không
  có gì để gửi lên. Chừng nào chưa có, form bỏ hẳn field `version` khỏi body thay vì gửi
  `undefined` (backend sẽ hiểu là thiếu field `100512`, không phải "bỏ qua").
- Mã lỗi mới cần có: **email đã được dùng** (hiện chưa có mã nào cho việc này).

### 3. Đổi số điện thoại — đề nghị **tách riêng**, không gộp vào `PATCH /auth/me`

`phonenumber` là tên đăng nhập. Đổi nó là đổi cách đăng nhập, nên nên có endpoint riêng, yêu cầu
nhập lại mật khẩu, và thu hồi các phiên khác sau khi đổi:

```
POST /auth/change-phonenumber   { phonenumber, currentPassword, version }
```

Gộp chung vào form hồ sơ sẽ dẫn tới chuyện người dùng vô tình đổi mất tài khoản đăng nhập của mình.

### 4. `GET /auth/sessions` + `DELETE /auth/sessions/:sessionId`

Backend **đã** ký `sid` vào cả access lẫn refresh token và đã có cơ chế chặn theo
`BLACK_LIST_{uid}_{sid}` — tức phần khó đã xong, chỉ thiếu chỗ liệt kê và thu hồi từng phiên.

```jsonc
// GET /auth/sessions → AppResponseDto<SessionResponseDto[]>
[
  {
    "sessionId": "…",
    "createdAt": "…",
    "lastSeenAt": "…",
    "userAgent": "…",      // nếu lưu được
    "ipAddress": "…",      // nếu lưu được
    "current": true         // trùng `sid` của token đang gọi
  }
]
```

`DELETE /auth/sessions/:sessionId` ghi blacklist đúng phiên đó. Thu hồi phiên hiện tại thì hành xử
như `logout`.

Giá trị so với `logout-all` đang có: người dùng thấy mình đang đăng nhập ở đâu và cắt đúng thiết bị
nghi ngờ, thay vì phải đăng xuất tất cả rồi đăng nhập lại khắp nơi.

## Nên cân nhắc thêm

- **Ảnh đại diện**: cần chỗ lưu file (S3/minio) và endpoint upload — đề nghị để sau, không chặn ba
  mục trên.
- **Không cho tự đổi `role` / `isActive`**: hai trường này phải do Admin đổi qua endpoint quản trị
  riêng, nếu không người dùng tự nâng quyền được.
- `POST /users` hiện là Admin-only và chưa có `PATCH /users/:slug` — màn quản trị người dùng (Admin
  sửa người khác) cũng đang thiếu. Không thuộc phạm vi đề xuất này nhưng cùng một gốc.

## Phần frontend đã dựng sẵn

Đã làm trước, nằm sau cờ trong `src/shared/api/backend-capabilities.ts`, mặc định `false`:

| Cờ | Bật khi backend xong |
|---|---|
| `profileEdit` | mục 1 + 2 |
| `sessionList` | mục 4 |

Trang `/account` đã có và đang chạy với những gì hiện có (số điện thoại, vai trò, đổi mật khẩu, đăng
xuất, đăng xuất mọi thiết bị). Bật cờ là hiện thêm form sửa hồ sơ và danh sách thiết bị — không phải
sửa gì thêm ở tầng UI.

**Xin xác nhận trước khi bật**: tên trường (`fullName`/`email`), dạng body `PATCH /auth/me`, và
hình dạng `SessionResponseDto`. Frontend đang code theo đúng tài liệu này; khác thì sửa ở
`entities/session`.

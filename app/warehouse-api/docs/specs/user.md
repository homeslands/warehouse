# Spec: user

## Mục tiêu

Từ khi bỏ đăng ký công khai (`POST /auth/register` đã xoá, xem `CLAUDE.md` mục "Auth flow"), tài khoản mới chỉ được **cấp phát bởi người có quyền quản trị** (admin cấp phát tài khoản, gán role ngay lúc tạo). Feature này bổ sung API tạo user (kèm gán role) và API xem danh sách user (lọc theo role) — dùng `User`/`Role` entity đã có sẵn (`src/user/user.entity.ts`, `src/role/role.entity.ts`), chưa có controller/service nào thao tác `User`.

## Entity / dữ liệu

Không tạo entity mới — dùng lại `User` (`src/user/user.entity.ts`) hiện có:

| Field | Kiểu | Bắt buộc? | Ghi chú |
|---|---|---|---|
| phonenumber | string | có | unique (đã có constraint DB `IDX`/unique trên `phonenumber_column`) |
| password | string | có | hash bằng bcrypt (`SALT_ROUNDS`, giống `AuthService`) trước khi lưu, **không bao giờ trả về trong response** |
| isActive | boolean | không | mặc định `true` (default của entity), không cho set lúc tạo ở version này |
| role | Role (FK) | có | gán qua `roleSlug` trong request — phải tồn tại trong `role_tbl` |

Quan hệ: `User belongsTo Role` (đã có sẵn, `ManyToOne` eager).

## Quy tắc nghiệp vụ

- Tạo user: nếu `phonenumber` đã tồn tại → lỗi `USER_PHONENUMBER_DOES_EXIST` (422). Không phân biệt user đó đang active hay đã bị vô hiệu hoá — chỉ cần tồn tại row là chặn (đúng hành vi cột unique hiện có).
- `roleSlug` không tồn tại trong `role_tbl` → lỗi `ROLE_NOT_FOUND` (tái dùng `RoleException`/`RoleValidation` đã có ở `src/role/`, không tạo lỗi riêng cho User vì đây là lỗi thuộc về Role).
- Password luôn được hash trước khi lưu (bcrypt, `SALT_ROUNDS` từ `.env`, cùng cấu hình `AuthService` đang dùng) — không lưu plaintext, không log ra password ở bất kỳ đâu.
- Response không bao giờ chứa field `password` (không có field này trong `UserResponseDto`, mapper cũng không map).
- Danh sách user hỗ trợ lọc theo `roleSlug` (query param, optional) — không truyền thì trả tất cả user (phân trang theo `BaseQueryDto` chuẩn).
- Không có endpoint sửa/xoá/đổi role của user khác ở version này (nợ kỹ thuật cũ trong `CLAUDE.md` — "Đổi role user khác: chưa có endpoint" — spec này chỉ thêm create + list, chưa giải quyết nợ kỹ thuật đó).

## Quyền truy cập

| Action | Authority yêu cầu |
|---|---|
| `POST /users` (tạo, gán role) | `USER_CREATE` |
| `GET /users` (danh sách, lọc theo role) | `USER_READ` |

`SUPER_ADMIN` bypass toàn bộ (theo cơ chế `AuthorityGuard` hiện có). Migration seed 2 authority này, cấp sẵn cho `ADMIN` (đúng pattern đã làm với `EXAMPLE_*` trong `docs/specs/authority-permission.md`) — role khác muốn có quyền thì admin tự bật qua `PUT /roles/:roleSlug/authorities/:authorityCode` sau khi seed.

## API cần có

- `POST /users` — tạo user mới, body: `phonenumber`, `password`, `roleSlug`.
- `GET /users` — danh sách user phân trang, query: `page`, `size`, `sort` (kế thừa `BaseQueryDto`) + `roleSlug` (optional, filter theo role).

## Ngoài phạm vi (Out of scope)

- Sửa/xoá user, đổi role của user đã tồn tại, đổi mật khẩu, khoá/mở khoá (`isActive`) — chưa có endpoint, giữ nguyên nợ kỹ thuật cũ.
- Validate định dạng số điện thoại, OTP xác thực khi tạo user — chưa làm (đúng tech debt đã ghi trong `CLAUDE.md`).
- Endpoint xem chi tiết 1 user theo id/slug — chưa cần ở version này (chỉ cần list + create theo yêu cầu).
- Gửi thông báo/SMS cho user mới được cấp phát tài khoản — chưa làm.

## Câu hỏi mở / chưa chốt

Không có — mặc định: `USER_CREATE`/`USER_READ` cấp sẵn cho `ADMIN` lúc seed (giống pattern `EXAMPLE_*`), `isActive` không set được lúc tạo (luôn `true`), không có endpoint chi tiết/sửa/xoá ở version này.

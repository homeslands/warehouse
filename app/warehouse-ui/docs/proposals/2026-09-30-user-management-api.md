# Đề xuất: API quản lý người dùng (WMS-12)

- Ngày: 2026-09-30 — cập nhật 2026-10-07 (đối chiếu backend `dev`, sau PR #81)
- Người viết: FE (warehouse-ui)
- Trạng thái: **phần lớn đã làm** (PR #72, #78, #80) — còn đặt lại mật khẩu hộ cho người CÙNG cấp + phạm vi kho (🟡), lọc phạm vi `GET /users`, chính sách mật khẩu, `PATCH` nhận `null`, nhật ký; và `DELETE /users/{slug}` đi ngược D5 (mục 3.7)

## 1. Tình trạng

| Chức năng | Backend | FE |
|---|---|---|
| Sửa hồ sơ `PATCH /users/{slug}` | ✅ PR #72 | ✅ dùng thật — chỉ gửi trường đã đổi |
| Đổi vai trò `POST /users/{slug}/change-role` | ✅ PR #72 | ✅ dùng thật — dialog riêng, gõ tên đăng nhập để xác nhận |
| Khoá `PUT /users/{slug}/lock` | ✅ PR #78 | ✅ dùng thật — hộp hai chiều, gõ SĐT đăng nhập để xác nhận khoá |
| Mở khoá `PUT /users/{slug}/unlock` | ✅ PR #78 | ✅ dùng thật — cùng hộp với khoá, không cần gõ xác nhận |
| ADMIN không đụng ADMIN (100417), không tự khoá (100414), chặn khoá quản lý kho (100415), không tự đổi vai trò (100416) | ✅ PR #72 | ✅ có bản dịch; nút đã ẩn đúng theo luật cấp |
| Phạm vi kho cho MANAGER/SUPERVISOR ở `GET /warehouses`, `GET /stores` | ✅ PR #72 | ✅ |
| Phạm vi kho ở `GET /warehouses/{slug}` (dưới ADMIN chỉ đọc kho mình quản lý/là thành viên, 100523) và cho cả vai trò tự tạo ở `GET /warehouses` | ✅ PR #80 | ✅ có bản dịch 100523 |
| `GET /auth/me` trả `userSlug`, `role { level }`, `warehouses [{ …, isManager }]`; bỏ `userId` | ✅ PR #80 | ✅ "Bạn" so bằng `userSlug`; cấp của mình lấy `role.level` (vai trò tự tạo không cần `ROLE_READ`) |
| `GET /users` lọc `name` / `phonenumber` / `isActive` / `warehouseSlug` / `roleSlug` / `startDate` + `endDate` + `sort` | ✅ PR #78 (khác đề xuất 3.1: không có `search`) | ✅ nhập toàn chữ số → `phonenumber`, ngược lại → `name`; lọc vai trò / trạng thái / kho (kho cần `WAREHOUSE_READ`) / khoảng ngày tạo; sắp xếp theo cột. Không lọc `birthday` (khớp đúng một ngày — ít giá trị) |
| `UserResponseDto` có `role { slug, name, description, level }` + `warehouses` | ✅ PR #78 (`role.level` thay `roleLevel`; `warehouses` chỉ là kho làm thành viên) | ✅ luật cấp dùng `role.level` của người bị tác động; cột "Kho" |
| Thành viên kho `PUT` / `DELETE /warehouses/{slug}/members` | ✅ WMS-11 | ✅ hộp thêm / gỡ ở trang chi tiết kho |
| `GET /warehouses/{slug}/available-members` (ứng viên) | ✅ PR #78 | ✅ ô chọn ứng viên khi thêm thành viên |
| Xem thành viên kho qua `GET /users?warehouseSlug=` | ✅ PR #78 (cần `USER_READ`) | ✅ khối "Thành viên" ở trang chi tiết kho |
| Chặn gán ADMIN trở lên vào kho (100524) | ✅ PR #78 | ✅ có bản dịch (mã mới 100418–100425, 100518–100520, 100522–100524) |
| **Xoá người dùng `DELETE /users/{slug}` + `USER_DELETE`** | ⚠️ PR #78 — trái D5 | FE không gọi, không có nút xoá (mục 3.7) |
| **Đặt lại mật khẩu hộ: kiểm cấp + phạm vi** | ⚠️ PR #80 chặn người cấp CAO hơn; người CÙNG cấp và phạm vi kho chưa (bug #1) | FE chặn tạm (ẩn nút với người cùng/cao cấp) |
| **`GET /users` lọc theo phạm vi** | ❌ | FE chặn tạm (lọc ở client) |
| Mật khẩu ≥ 8, mật khẩu tạm | ❌ | FE chặn tạm độ dài 8 |
| `PATCH` nhận `null` để xoá trống trường tuỳ chọn | ❌ | ô trống = giữ nguyên |
| Nhật ký thao tác | ❌ | — |

"FE chặn tạm" = chỉ là lớp giao diện (ẩn nút / lọc dòng / kiểm form). Gọi thẳng API vẫn vượt được — lớp bảo vệ
thật phải ở backend.

## 2. Luật phân quyền đã chốt

Một thao tác lên người dùng khác chỉ hợp lệ khi qua **cả ba** bước —

1. **Có mã quyền** (`@RequireAuthority`).
2. **Người bị tác động có vai trò cấp THẤP HƠN người gọi** — SUPER_ADMIN bypass. Không thao tác trên chính mình.
   Backend đã có `UserService.assertCanManageUser` (PR #72) cho đúng việc này.
3. **Người bị tác động thuộc phạm vi kho của người gọi** — chỉ áp cho người dưới ADMIN. Phạm vi kho của MANAGER =
   các kho có `warehouse.manager` là mình; thành viên lấy từ `warehouse_member_tbl`.

| # | Quyết định | Backend |
|---|---|---|
| D1 | **Xem danh sách:** ADMIN, SUPER_ADMIN thấy toàn bộ. MANAGER thấy chính mình + thành viên các kho mình quản lý. User chưa thuộc kho nào chỉ ADMIN trở lên thấy | ❌ (3.1) — PR #78 chỉ thêm bộ lọc, chưa lọc phạm vi |
| D2 | **Tạo / sửa / đổi vai trò / khoá / mở khoá:** chỉ ADMIN trở lên, áp bước 2 | ✅ (mở khoá: `PUT …/unlock`, PR #78) |
| D3 | **Đặt lại mật khẩu hộ:** ADMIN trở lên (bước 2); MANAGER chỉ cho thành viên kho mình (bước 2 + 3) | ⚠️ một phần (bug #1) |
| D4 | Không tự khoá mình; không mất người quản trị cuối cùng | ✅ |
| D5 | **Chỉ khoá, không xoá** người dùng | ⚠️ PR #78 thêm `DELETE /users/{slug}` xoá thật (3.7) |
| D6 | Thành viên kho chỉ là vai trò cấp dưới ADMIN | ✅ gán chặn bằng 100524 (PR #78); chưa gỡ khỏi kho khi đổi vai trò lên ADMIN |
| D7 | Chặn khoá người đang là quản lý của một kho | ✅ (100415) |
| D8 | Mật khẩu ≥ 8 ký tự; mật khẩu do người khác đặt là **mật khẩu tạm** — bắt đổi ở lần đăng nhập đầu | ❌ (3.4) |
| D9 | Ghi nhật ký mọi thao tác quản trị người dùng | ❌ (3.6) |

## 3. Việc backend còn phải làm

### Bug (kiểm lại trên sandbox 2026-10-05)

| # | Mức | Mô tả | Tái hiện | Đề xuất sửa |
|---|---|---|---|---|
| 1 | 🟡 | `POST /users/{slug}/change-password`: PR #80 đã chặn target cấp **cao hơn** (MANAGER → ADMIN giờ **403** 100407, kiểm sandbox 2026-10-07) nhưng code ghi rõ "ngang cấp vẫn cho đổi" và chưa kiểm phạm vi kho | ADMIN → ADMIN khác, MANAGER → MANAGER khác: vẫn đổi được (theo code PR #80) | Đổi `>` thành `>=` (chỉ cho cấp THẤP HƠN — khớp `assertCanManageUser`), rồi thêm kiểm phạm vi kho cho MANAGER (D3) |
| 2 | 🟡 | `GET /users` trả **toàn bộ** người dùng cho mọi người có `USER_READ` | MANAGER thấy cả ADMIN và root (họ tên, SĐT, email, ngày sinh, địa chỉ) | Lọc theo D1 — mục 3.1 |
| 3 | 🟡 | Không có chính sách mật khẩu | `POST /users` với `password: "1"` → 201 | D8 — mục 3.4 |
| 4 | ✅ | ~~`PUT /warehouses/{slug}/members` gán được mọi vai trò, kể cả ADMIN/SUPER_ADMIN~~ | Đã sửa ở PR #78 — mã 100524 | — |
| 5 | 🟡 | `PATCH /users/{slug}` không xoá trống được `email` / `dob` / `address` | `pickDefined` lọc cả `null` | Nhận `null` cho 3 trường này (xử lý riêng, không qua `pickDefined`) |
| 6 | ⚪ | Token phát **cùng giây** với lúc đổi mật khẩu hộ / khoá không bị thu hồi (`iat` theo giây) | Login rồi ngay lập tức bị đặt lại mật khẩu → token cũ vẫn dùng được | **Đánh đổi đã chấp nhận** (`docs/specs/token-revocation.md`); kẽ hở chỉ còn ở đặt lại hộ và khoá. Sửa triệt để cần claim thời gian theo mili-giây — backend tự cân nhắc |
| 7 | ⚪ | Swagger không hiện `page` / `size` ở **mọi** endpoint danh sách dù `BaseQueryDto` đã khai | — | Chỉ là lỗi tài liệu — phân trang vẫn chạy đúng |
| 8 | ⚪ | `hasPrevios` sai chính tả; `createdAt` trả `Date.toString()` thay vì ISO; `sort` một giá trị → 400, mảng thì bị bỏ qua | — | Trả ISO 8601; `@Transform` bọc chuỗi thành mảng và service đọc `sort`. Đổi `hasPrevios` phải báo FE trước |

### 3.1. `GET /users` — lọc theo phạm vi (còn thiếu)

Bộ lọc **đã làm** ở PR #78 nhưng khác đề xuất: có `name` (họ / tên / "họ tên", chứa chuỗi) và `phonenumber` (chứa
chuỗi) tách riêng, **không có `search`** chung — FE tự chọn tham số theo ô nhập. Có thêm `isActive`, `warehouseSlug`
(chỉ tính **thành viên**, không tính kho làm quản lý), `roleSlug`, `sort` (mảng `field:ASC|DESC`).
`UserResponseDto` có `role.level` (thay `roleLevel`) và `warehouses: [{ slug, code, name }]` — chỉ kho làm thành
viên, **không** gồm kho người đó quản lý, và không có `isManager`; `mustChangePassword` chưa có.

**Còn thiếu:** `findAll` vẫn chưa nhận người gọi để lọc phạm vi — vẫn trả **toàn bộ** người dùng cho mọi người có
`USER_READ`. Đề xuất lọc **ngay trong query** (để `total`/phân trang đúng):

- ADMIN trở lên: không lọc phạm vi.
- MANAGER: `user.id = người gọi` **hoặc** user là thành viên (chưa xoá mềm) của một kho có `manager = người gọi`;
  `warehouseSlug` chỉ truyền được kho mình quản lý.

Lưu ý: xem thành viên kho chỉ cần `USER_READ` (không cần `WAREHOUSE_READ`), nên MANAGER xem được thành viên của
**mọi** kho — hệ quả của việc chưa lọc phạm vi.

### 3.2. Mở khoá tài khoản — ✅ đã làm (PR #78)

`PUT /users/{slug}/unlock` (`USER_UPDATE`), đối xứng với `PUT /users/{slug}/lock`. FE đã gộp thành một hộp hai chiều
(`features/user-toggle-active`).

### 3.3. Thành viên kho — ✅ phần lớn đã làm (PR #78)

- Đã có `GET /warehouses/{slug}/available-members` (ứng viên) và xem thành viên qua `GET /users?warehouseSlug=`.
  Gán / gỡ (`PUT` / `DELETE .../members`) cần `WAREHOUSE_UPDATE` + `USER_READ`; quyền gán theo **mã**, không theo
  vai trò.
- Đã chặn gán vai trò từ ADMIN trở lên (100524). Còn thiếu: đổi vai trò của user lên ADMIN trở lên thì gỡ khỏi mọi
  kho.

### 3.4. Mật khẩu: độ dài + mật khẩu tạm (D8)

- Tối thiểu 8 ký tự cho `POST /users`, `POST /users/{slug}/change-password`, `POST /auth/change-password`; mã lỗi
  riêng để FE gắn vào ô. (FE đang kiểm 8 ký tự ở cả ba form.)
- Mật khẩu do `POST /users` và `.../change-password` (đặt hộ) đặt → `mustChangePassword = true`. `POST /auth/login`
  và `GET /auth/me` trả cờ này; khi `true`, mọi endpoint trừ `/auth/me`, `/auth/change-password`, `/auth/logout` trả
  mã lỗi riêng (403). Tự đổi mật khẩu thành công → `false`.

### 3.5. Mã authority

| Mã | Endpoint | Cấp sẵn cho |
|---|---|---|
| `USER_UPDATE` ✅ | `PATCH /users/{slug}`, `PUT .../lock`, `PUT .../unlock`, `.../change-role` | ADMIN |
| `USER_DELETE` ⚠️ | `DELETE /users/{slug}` (xoá thật) | ADMIN — xem 3.7 |
| `USER_CHANGE_PASSWORD` ✅ | `POST /users/{slug}/change-password` | ADMIN, MANAGER — phạm vi do D3 giới hạn |

### 3.6. Nhật ký thao tác (D9)

Ghi một dòng cho mỗi lần: tạo user, sửa, đổi vai trò, khoá / mở khoá, đặt lại mật khẩu hộ, gán / gỡ thành viên kho —
gồm người thực hiện, người bị tác động, hành động, giá trị cũ → mới, thời điểm. FE chưa cần màn xem nhật ký.

### 3.7. Xoá người dùng — trái quyết định D5

PR #78 đổi `DELETE /users/{slug}` từ "khoá" thành **xoá thật** và thêm mã `USER_DELETE` (cấp sẵn ADMIN). Nghiệp vụ
đã chốt D5 là **chỉ khoá, không xoá**. FE **không** làm nút xoá và không gọi endpoint này (khoá / mở khoá đã dùng
`PUT …/lock|unlock`); FE chỉ thêm mã `USER_DELETE` vào danh sách để màn `/permissions` không báo lệch. Đề nghị
backend gỡ endpoint, hoặc không cấp sẵn `USER_DELETE` cho vai trò nào.

## 4. Dữ liệu test cần dọn trên sandbox

| SĐT | Vai trò | Ghi chú |
|---|---|---|
| `0390461390` | SUPERVISOR | "ZZ Test Claude", mật khẩu đã biết |
| `0397808135` | **ADMIN** | "ZZ Test Admin", mật khẩu đã biết — **cần khoá** (dùng `PUT /users/{slug}/lock` với SUPER_ADMIN) |

# Spec: Store (cửa hàng / pháp nhân xuất hoá đơn)

## Mục tiêu

Tạo master data **cửa hàng** — đơn vị quản lý sản phẩm và xuất hoá đơn. `Store` **độc lập hoàn toàn với `Warehouse`**: không có FK, không có bảng nối, không có ràng buộc nghiệp vụ nào giữa 2 entity ở version này. Kho là nơi chứa vật tư; cửa hàng là pháp nhân bán hàng và đứng tên trên hoá đơn. ADMIN quản lý danh sách cửa hàng; MANAGER/SUPERVISOR đọc danh sách để chọn khi lập phiếu/hoá đơn sau này.

## Entity / dữ liệu

| Field | Kiểu | Bắt buộc? | Ghi chú |
|---|---|---|---|
| name | string | có | tên hiển thị của cửa hàng, unique giữa các store chưa xoá (check ở service) |
| code | string | có | mã cửa hàng nghiệp vụ, vd `ST-HN-01`. UNIQUE ở DB, tự `trim().toUpperCase()` |
| legalName | string | có | tên pháp nhân đầy đủ in trên hoá đơn, vd `Công ty TNHH ABC` |
| taxCode | string | có | mã số thuế, `/^\d{10}(-\d{3})?$/`. Unique giữa các store chưa xoá (check ở service) |
| invoiceAddress | string | không | địa chỉ ghi trên hoá đơn (địa chỉ đăng ký kinh doanh) |
| phonenumber | string | không | `/^0\d{8,10}$/` — cho phép cả số cố định |
| email | string | không | `@IsEmail()` |
| address | string | không | địa chỉ thực tế của cửa hàng (có thể khác `invoiceAddress`) |
| isActive | boolean | có | default `true`; cửa hàng ngừng hoạt động thì set `false` |

**Đặt tên field:** spec gốc viết `phoneNumber`, nhưng entity dùng **`phonenumber`** (toàn chữ thường) để khớp `Warehouse.phonenumber` và `User.phonenumber` đang có trong repo — 3 entity gọi cùng một khái niệm bằng cùng một tên. Cột DB: `phonenumber_column`.

Quan hệ với entity khác: **Không có.** Không FK tới `Warehouse`, `User`, hay `Material`.

Entity kế thừa **`VersionedBase`**: cửa hàng được sửa theo luồng "load full ra form, sửa nhiều field (8 field, phần lớn là thông tin pháp nhân), lưu lại" — 2 admin sửa cùng lúc có thể ghi đè nhau ⇒ cần optimistic locking. Không có thao tác atomic tăng/giảm nào trên entity này.

## Quy tắc nghiệp vụ

- `code` unique ở **DB level**, chuẩn hoá `trim().toUpperCase()` trong mapper ⇒ `st-hn-01` và `ST-HN-01` là **trùng nhau**.
- `code` unique giữa các store **chưa xoá mềm**. Nếu `code` đang bị 1 store đã xoá mềm giữ chỗ ⇒ trả lỗi riêng `STORE_CODE_RESERVED_BY_DELETED_STORE` (chặn ở service để MySQL không ném `ER_DUP_ENTRY` thành 500).
- `name` unique giữa các store chưa xoá mềm (check ở service, không có index DB).
- `taxCode` unique giữa các store chưa xoá mềm (check ở service, **không** unique ở DB) — 2 cửa hàng cùng mã số thuế sẽ tạo ra hoá đơn không phân biệt được pháp nhân phát hành. Không unique ở DB vì nếu sau này cho phép nhiều chi nhánh chung 1 MST thì chỉ cần gỡ check ở service, không cần migration.
- `taxCode` chỉ `trim()`, **không** uppercase (toàn chữ số + dấu gạch ngang, uppercase vô nghĩa).
- Khi update, chỉ check lại trùng `code`/`name`/`taxCode` nếu giá trị **thực sự đổi** — gửi lại đúng giá trị cũ không bị báo trùng với chính nó.
- **Không xoá được cửa hàng đang `isActive`** — phải `PATCH isActive: false` trước. Rào chống xoá nhầm rẻ nhất khi chưa có bảng sản phẩm/hoá đơn để check tham chiếu.
- Xoá là **xoá mềm** (`softRemove`).
- `email` được `trim().toLowerCase()` trước khi lưu; không unique (2 cửa hàng dùng chung 1 email liên hệ là hợp lệ).

## Quyền truy cập

Dùng **RBAC cơ bản (`@HasRole`)**, không dùng `@RequireAuthority` ⇒ **không cần migration seed `Authority`**. Đây là mặc định cho module nghiệp vụ mới theo `CLAUDE.md`, và khớp với `warehouse`/`material-type`/`material` đang dùng.

| Action | Role |
|---|---|
| Create | `ADMIN` |
| Read (list/detail) | `ADMIN`, `MANAGER`, `SUPERVISOR` |
| Update | `ADMIN` |
| Delete | `ADMIN` |

`SUPER_ADMIN` bypass toàn bộ. Read cấp cho cả 3 role vì mọi màn hình chọn cửa hàng (lập phiếu, xuất hoá đơn sau này) đều cần dropdown danh sách store.

## API cần có

CRUD chuẩn 5 route, không có endpoint đặc thù:

- `POST /stores` — tạo cửa hàng.
- `GET /stores` — danh sách phân trang, filter `isActive`.
- `GET /stores/:slug` — chi tiết.
- `PATCH /stores/:slug` — cập nhật (body bắt buộc có `version`).
- `DELETE /stores/:slug` — xoá mềm.

Mã lỗi dùng dải **`1010xx`** (`101001`+) — dải chưa module nào dùng (`1000xx`–`1008xx` đã có chủ, `100800`–`100900` là dải dùng chung).

## Ngoài phạm vi (Out of scope)

- **Xuất hoá đơn** — user nói rõ "but not working this task". Entity chỉ *chứa* thông tin pháp nhân để sau này in lên hoá đơn; không có logic sinh số hoá đơn, mẫu hoá đơn, hay tích hợp cơ quan thuế.
- **Quản lý sản phẩm theo store** — chưa có FK `Product → Store`, chưa có bảng `Product`.
- Chưa có quan hệ nào với `Warehouse` (cố ý — Store độc lập).
- Chưa hỗ trợ `sort` (`BaseQueryDto.sort` bị bỏ qua, luôn `createdAt DESC` — giống mọi module hiện có).
- Chưa có API restore store đã xoá mềm, chưa có audit log đổi thông tin pháp nhân.
- Chưa có phân công người phụ trách store (khác `warehouse` — store chưa có `manager`).
- Chưa validate MST theo thuật toán checksum thật của Tổng cục Thuế, chỉ check format `/^\d{10}(-\d{3})?$/`.

## Câu hỏi mở / chưa chốt

Không có — 4 điểm thiết kế (field bắt buộc, có `isActive` hay không, độ chặt validate `taxCode`/`email`, phạm vi unique) đã chốt với user trước khi lập plan (`docs/plans/store.md`).

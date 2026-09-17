# Spec: Warehouse (kho + phân công quản lý kho)

## Mục tiêu

Tạo master data **kho** cho hệ thống và cho phép phân công **1 quản lý kho** (`User` role `MANAGER`) cho mỗi kho. Đây là nền cho 4 module phiếu kho sắp làm (nhập/xuất/kiểm/chi) — mọi phiếu đều phải trỏ về 1 kho cụ thể, và ô "✓ (người duyệt)" của `MANAGER` trong bảng phân quyền 5.5 chỉ có nghĩa khi biết ai quản lý kho nào. ADMIN quản lý danh sách kho + phân công; MANAGER/SUPERVISOR đọc danh sách kho để chọn khi lập phiếu; MANAGER xem được kho mình phụ trách.

## Entity / dữ liệu

| Field | Kiểu | Bắt buộc? | Ghi chú |
|---|---|---|---|
| name | string | có | tên kho, unique giữa các kho chưa xoá (check ở service, không có index DB) |
| code | string | có | mã kho nghiệp vụ, vd `WH-HN-01`. UNIQUE ở DB, tự `trim().toUpperCase()` |
| address | string | có | địa chỉ kho |
| phonenumber | string | không | số liên hệ của kho, cho phép cả số cố định (`/^0\d{8,10}$/`) |
| description | string | không | ghi chú tự do |
| isActive | boolean | có | default `true`; kho ngừng hoạt động thì set `false` |
| manager | FK → `User` | không | `manager_id_column`, nullable — "kho chưa có quản lý" là trạng thái hợp lệ |

Quan hệ: `Warehouse belongsTo User` (`@ManyToOne`, `ON DELETE SET NULL`, **không** `eager`).

Entity kế thừa **`VersionedBase`**: kho được sửa theo luồng "load full ra form, sửa nhiều field, lưu lại", 2 admin sửa cùng lúc có thể ghi đè nhau ⇒ cần optimistic locking.

## Quy tắc nghiệp vụ

- `code` unique giữa các kho **chưa xoá mềm**. Nếu `code` đang bị 1 kho đã xoá mềm giữ chỗ ⇒ trả lỗi riêng `WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE` (chặn ở service để MySQL không ném `ER_DUP_ENTRY` thành 500).
- `name` unique giữa các kho chưa xoá mềm.
- `code` được chuẩn hoá `trim().toUpperCase()` trong mapper ⇒ `wh-hn-01` và `WH-HN-01` là **trùng nhau**.
- Khi update, chỉ check lại trùng `code`/`name` nếu giá trị thực sự đổi.
- **Phân công quản lý**: user được gán phải (1) tồn tại và chưa xoá mềm, (2) `isActive === true`, (3) `role.name === 'MANAGER'`. Gán `SUPERVISOR` làm quản lý kho sẽ tạo ra người không có quyền `IMPORT_FORM_CONFIRM`/`EXPORT_FORM_CONFIRM`/`BALANCE_FORM_APPROVE`/`WAREHOUSE_PAYMENT_APPROVE` của chính kho mình quản lý — đây là ràng buộc toàn vẹn dữ liệu, không phải phân quyền người gọi.
- **1 user được phụ trách nhiều kho** — cố ý cho phép (tổ chức nhỏ 1 quản lý 2 điểm). Siết lại sau cần migration; nới ra thì miễn phí.
- Gửi `managerSlug: null` để **gỡ phân công**; không tra user, không lỗi.
- Gán lại đúng manager đang có: vẫn `save`, `version` vẫn tăng — không short-circuit.
- **Không xoá được kho đang `isActive`** — phải `PATCH isActive: false` trước. Rào chống xoá nhầm rẻ nhất khi chưa có bảng tồn kho/phiếu để check tham chiếu.
- Xoá là **xoá mềm** (`softRemove`); kho đã xoá **giữ nguyên** `manager_id_column` để restore sau này còn ý nghĩa.
- `managerSlug` **không** nằm trong body create/update: `AuthorityGuard` chặn theo endpoint chứ không theo field, để `managerSlug` trong create thì ai có `WAREHOUSE_CREATE` cũng phân công được manager mà không cần `WAREHOUSE_ASSIGN_MANAGER`.

## Quyền truy cập

| Action | Authority | Role được cấp sẵn lúc seed |
|---|---|---|
| Create | `WAREHOUSE_CREATE` | ADMIN |
| Read (list/detail) | `WAREHOUSE_READ` | ADMIN, MANAGER, SUPERVISOR |
| Read "kho của tôi" | *(không có, chỉ cần JWT)* | mọi user đã đăng nhập |
| Update | `WAREHOUSE_UPDATE` | ADMIN |
| Delete | `WAREHOUSE_DELETE` | ADMIN |
| Assign manager | `WAREHOUSE_ASSIGN_MANAGER` | ADMIN |

`SUPER_ADMIN` bypass toàn bộ trong `AuthorityGuard`, không seed row `permission_tbl`. `WAREHOUSE_READ` cấp cho cả 3 role vì mọi màn hình lập phiếu đều cần dropdown chọn kho. `WAREHOUSE_ASSIGN_MANAGER` giữ riêng ADMIN — cấp cho MANAGER là để họ tự bổ nhiệm mình vào bất kỳ kho nào.

## API cần có

- `POST /warehouses` — tạo kho.
- `GET /warehouses` — danh sách phân trang, filter `isActive`, `managerSlug`, `hasManager`.
- `GET /warehouses/mine` — kho mà người đang đăng nhập phụ trách (phân trang, filter `isActive`). **Phải khai trước `GET /:slug`** trong controller.
- `GET /warehouses/:slug` — chi tiết.
- `PATCH /warehouses/:slug` — cập nhật **partial**: chỉ gửi field cần đổi, field không gửi giữ nguyên giá trị cũ; riêng `version` luôn bắt buộc.
- `PUT /warehouses/:slug/manager` — phân công / gỡ phân công quản lý (body `{ managerSlug: string | null, version: number }`). Idempotent, trả về `WarehouseResponseDto` đã bump `version`.
- `DELETE /warehouses/:slug` — xoá mềm.

## Quan hệ với `Store` (1-1, thêm 2026-09-17)

Mỗi kho thuộc tối đa 1 cửa hàng. `Warehouse.store` là **inverse side** — không có cột nào trên `warehouse_tbl`, FK + UNIQUE nằm ở `store_tbl.warehouse_id_column`. Việc gắn/gỡ làm **hoàn toàn ở phía store** qua `PUT /stores/:slug/warehouse`; module `warehouse` không có endpoint nào đụng tới quan hệ này và read path của nó chưa trả `storeSlug`. Chi tiết quy tắc: `docs/specs/store.md`, mục "Quan hệ Store ↔ Warehouse (1-1)".

Hệ quả cần nhớ: kho `isActive = false` **không gắn được** cho cửa hàng, và kho đang thuộc 1 cửa hàng thì cửa hàng khác không lấy được (kể cả khi cửa hàng giữ nó đã bị xoá mềm).

- `version` trong `UpdateWarehouseRequestDto`/`AssignWarehouseManagerRequestDto` bắt buộc `@Min(1)` — gửi `version: 0` sẽ bypass hoàn toàn optimistic lock của TypeORM (`SelectQueryBuilder.js:691-693`, `0` là falsy ⇒ check không chạy). Xem `docs/specs/store.md` mục "Quy tắc nghiệp vụ".

## Ngoài phạm vi (Out of scope)

- Chưa trả `storeSlug` trong `WarehouseResponseDto` — muốn biết kho thuộc cửa hàng nào thì tra từ phía `GET /stores`.
- Chưa hỗ trợ `sort` (`BaseQueryDto.sort` bị bỏ qua, luôn `createdAt DESC` — giống mọi module hiện có).
- Chưa có row-level scoping của phiếu theo kho (MANAGER vẫn thấy mọi kho ở `GET /warehouses`) — sẽ làm cùng module phiếu.
- Chưa giới hạn 1 manager chỉ được 1 kho.
- Chưa có API restore kho đã xoá mềm, chưa có lịch sử đổi manager / audit log.
- Chưa có khái niệm tồn kho, khu vực (zone/bin) trong kho, hay kho con.
- Chưa gửi thông báo cho user khi được phân công làm quản lý kho.

## Câu hỏi mở / chưa chốt

Không có — 6 điểm thiết kế (quan hệ manager, field, base class, phân quyền, ràng buộc role manager, scoping) đã chốt với user trước khi lập plan (`docs/plans/warehouse.md`).

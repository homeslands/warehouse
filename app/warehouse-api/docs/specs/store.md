# Spec: Store (cửa hàng / pháp nhân xuất hoá đơn)

## Mục tiêu

Tạo master data **cửa hàng** — đơn vị quản lý sản phẩm và xuất hoá đơn. Kho là nơi chứa vật tư; cửa hàng là pháp nhân bán hàng và đứng tên trên hoá đơn. ADMIN quản lý danh sách cửa hàng; MANAGER/SUPERVISOR đọc danh sách để chọn khi lập phiếu/hoá đơn sau này.

> **Cập nhật 2026-09-17:** `Store` **có quan hệ 1-1 với `Warehouse`** — mỗi cửa hàng gắn tối đa 1 kho, mỗi kho thuộc tối đa 1 cửa hàng. Bản spec đầu tiên chốt "độc lập hoàn toàn, không FK"; quyết định đó đã bị đảo lại theo yêu cầu của user. Xem mục "Quan hệ Store ↔ Warehouse (1-1)" bên dưới.

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
| warehouse | quan hệ 1-1 tới `Warehouse` | không | FK `warehouse_id_column` (UNIQUE, NULL được) trỏ tới `warehouse_tbl.id_column` |

**Đặt tên field:** spec gốc viết `phoneNumber`, nhưng entity dùng **`phonenumber`** (toàn chữ thường) để khớp `Warehouse.phonenumber` và `User.phonenumber` đang có trong repo — 3 entity gọi cùng một khái niệm bằng cùng một tên. Cột DB: `phonenumber_column`.

Quan hệ với entity khác: **1-1 với `Warehouse`** (xem mục riêng bên dưới). Không FK tới `User` hay `Material`.

Entity kế thừa **`VersionedBase`**: cửa hàng được sửa theo luồng "load full ra form, sửa nhiều field (8 field, phần lớn là thông tin pháp nhân), lưu lại" — 2 admin sửa cùng lúc có thể ghi đè nhau ⇒ cần optimistic locking. Không có thao tác atomic tăng/giảm nào trên entity này.

## Quy tắc nghiệp vụ

- `code` unique ở **DB level**, chuẩn hoá `trim().toUpperCase()` trong mapper ⇒ `st-hn-01` và `ST-HN-01` là **trùng nhau**.
- `code` unique giữa các store **chưa xoá mềm**. Nếu `code` đang bị 1 store đã xoá mềm giữ chỗ ⇒ trả lỗi riêng `STORE_CODE_RESERVED_BY_DELETED_STORE` (chặn ở service để MySQL không ném `ER_DUP_ENTRY` thành 500).
- `name` unique giữa các store chưa xoá mềm (check ở service, không có index DB).
- `taxCode` unique giữa các store chưa xoá mềm (check ở service, **không** unique ở DB) — 2 cửa hàng cùng mã số thuế sẽ tạo ra hoá đơn không phân biệt được pháp nhân phát hành. Không unique ở DB vì nếu sau này cho phép nhiều chi nhánh chung 1 MST thì chỉ cần gỡ check ở service, không cần migration.
- `taxCode` chỉ `trim()`, **không** uppercase (toàn chữ số + dấu gạch ngang, uppercase vô nghĩa).
- ⚠️ `taxCode` dạng chi nhánh (`0101234567-001`) **vẫn hợp lệ ở `Store`**, nhưng **không tra cứu được** qua module `tax-profile` — nhà cung cấp tra cứu chỉ phục vụ mã 10 chữ số (xem `docs/specs/tax-profile.md`). Store dùng mã chi nhánh sẽ phải nhập `legalName`/`invoiceAddress` tay.
- Khi update, chỉ check lại trùng `code`/`name`/`taxCode` nếu giá trị **thực sự đổi** — gửi lại đúng giá trị cũ không bị báo trùng với chính nó.
- **Không xoá được cửa hàng đang `isActive`** — phải `PATCH isActive: false` trước. Rào chống xoá nhầm rẻ nhất khi chưa có bảng sản phẩm/hoá đơn để check tham chiếu.
- Xoá là **xoá mềm** (`softRemove`).
- `version` trong mọi write DTO (`UpdateStoreRequestDto`, `AssignStoreWarehouseRequestDto`) bắt buộc **`@Min(1)`**, không chỉ `@IsInt()`. Lý do không hiển nhiên: TypeORM bọc cả khối so sánh version của optimistic lock trong `if (result && lockMode === 'optimistic' && lockVersion)` (`SelectQueryBuilder.js:691-693`) — `0` là falsy nên gửi `version: 0` khiến check **không chạy** và `save()` ghi đè vô điều kiện, chỉ với 1 request. `@IsNotEmpty` lẫn `@IsInt` đều cho `0` đi qua. Chặn ở DTO là rào duy nhất.
- `email` được `trim().toLowerCase()` trước khi lưu; không unique (2 cửa hàng dùng chung 1 email liên hệ là hợp lệ).

## Quan hệ Store ↔ Warehouse (1-1)

- **Owning side là `Store`**: cột `store_tbl.warehouse_id_column` + **UNIQUE index** `UQ_store_warehouse`. Chính UNIQUE đó là thứ chặn 2 cửa hàng cùng trỏ vào 1 kho ở tầng DB — service chỉ check trước để trả lỗi nghiệp vụ thay vì để MySQL ném `ER_DUP_ENTRY` thành 500. `Warehouse.store` là inverse side, không có cột nào trên `warehouse_tbl`.
- **Nullable**: cửa hàng chưa gắn kho (và kho chưa thuộc cửa hàng nào) là trạng thái hợp lệ. MySQL cho phép nhiều NULL trong UNIQUE index nên nhiều cửa hàng cùng ở trạng thái "chưa gắn" vẫn OK. `POST /stores` **không** nhận `warehouseSlug` — tạo xong mới gắn.
- **Gắn/gỡ qua endpoint riêng** `PUT /stores/:slug/warehouse` (body `{ warehouseSlug: string | null, version: number }`), **không** qua `PATCH /stores/:slug` — nó thay thế đúng 1 slot và idempotent, cùng tinh thần `PUT /warehouses/:slug/manager`. `warehouseSlug: null` là đường gỡ gắn kết duy nhất (không có `DELETE` riêng).
- `version` bắt buộc như mọi thao tác ghi trên entity `VersionedBase` — lệch version trả `DATA_VERSION_CONFLICT` 409.
- Quan hệ **không `eager`**: mọi read path phải truyền `relations: { warehouse: true }`, thiếu là response im lặng mất `warehouseSlug`.
- Response `StoreResponseDto` flatten thành `warehouseSlug` + `warehouseName` (giống `WarehouseResponseDto.managerSlug`), không trả nguyên entity `Warehouse`.

Quy tắc khi gắn:

| Tình huống | Kết quả |
|---|---|
| Kho không tồn tại / đã xoá mềm | `WAREHOUSE_NOT_FOUND` (dùng lại mã của module `warehouse`, giống `warehouse-material`) |
| Kho `isActive = false` | `STORE_WAREHOUSE_INACTIVE` (101018) |
| Kho đang thuộc cửa hàng khác còn sống | `STORE_WAREHOUSE_ALREADY_ASSIGNED` (101019) |
| Kho bị cửa hàng **đã xoá mềm** giữ chỗ | `STORE_WAREHOUSE_RESERVED_BY_DELETED_STORE` (101020) — UNIQUE index không bỏ qua row xoá mềm, giống cách xử lý `code` |
| Gửi lại đúng kho cửa hàng đang giữ | Thành công (idempotent), không báo trùng với chính mình |

FK dùng **`ON DELETE SET NULL`** (giống `FK_warehouse_manager`): "cửa hàng chưa có kho" là trạng thái hợp lệ nên xoá cứng kho thoái hoá về trạng thái đó thay vì chặn. Thực tế kho chỉ xoá mềm nên nhánh này hiếm khi chạy.

## Quyền truy cập

Dùng **RBAC cơ bản (`@HasRole`)**, không dùng `@RequireAuthority` ⇒ **không cần migration seed `Authority`**. Đây là mặc định cho module nghiệp vụ mới theo `CLAUDE.md`, và khớp với `warehouse`/`material-type`/`material` đang dùng.

| Action | Role |
|---|---|
| Create | `ADMIN` |
| Read (list/detail) | `ADMIN`, `MANAGER`, `SUPERVISOR` |
| Update | `ADMIN` |
| Gắn/gỡ kho (`PUT /stores/:slug/warehouse`) | `ADMIN` |
| Delete | `ADMIN` |

`SUPER_ADMIN` bypass toàn bộ. Read cấp cho cả 3 role vì mọi màn hình chọn cửa hàng (lập phiếu, xuất hoá đơn sau này) đều cần dropdown danh sách store.

## API cần có

CRUD chuẩn 5 route, không có endpoint đặc thù:

- `POST /stores` — tạo cửa hàng.
- `GET /stores` — danh sách phân trang, filter `isActive`.
- `GET /stores/:slug` — chi tiết.
- `PATCH /stores/:slug` — cập nhật (body bắt buộc có `version`). **Không** đụng tới `warehouse`.
- `PUT /stores/:slug/warehouse` — gắn kho (hoặc gỡ với `warehouseSlug: null`).
- `DELETE /stores/:slug` — xoá mềm.

Mã lỗi dùng dải **`1010xx`** (`101001`+) — dải chưa module nào dùng (`1000xx`–`1008xx` đã có chủ, `100800`–`100900` là dải dùng chung). Đang dùng tới `101020`.

## Ngoài phạm vi (Out of scope)

- **Xuất hoá đơn** — user nói rõ "but not working this task". Entity chỉ *chứa* thông tin pháp nhân để sau này in lên hoá đơn; không có logic sinh số hoá đơn, mẫu hoá đơn, hay tích hợp cơ quan thuế.
- **Quản lý sản phẩm theo store** — chưa có FK `Product → Store`, chưa có bảng `Product`.
- Chưa lọc danh sách theo kho (`GET /stores` chưa có `warehouseSlug`/`hasWarehouse` như `GET /warehouses` có `managerSlug`/`hasManager`).
- Chưa cho gắn kho ngay trong `POST /stores` — phải tạo store rồi gọi `PUT /stores/:slug/warehouse`.
- Chưa có chiều đọc ngược qua API kho (`GET /warehouses/:slug` chưa trả `storeSlug`) — quan hệ inverse đã khai ở entity nhưng chưa dùng ở read path nào của module `warehouse`.
- Xoá mềm cửa hàng **không** tự nhả kho: FK vẫn giữ, kho đó không gắn cho cửa hàng khác được cho tới khi có API restore/hard-delete (trả `STORE_WAREHOUSE_RESERVED_BY_DELETED_STORE`).
- Chưa hỗ trợ `sort` (`BaseQueryDto.sort` bị bỏ qua, luôn `createdAt DESC` — giống mọi module hiện có).
- Chưa có API restore store đã xoá mềm, chưa có audit log đổi thông tin pháp nhân.
- Chưa có phân công người phụ trách store (khác `warehouse` — store chưa có `manager`).
- Chưa validate MST theo thuật toán checksum thật của Tổng cục Thuế, chỉ check format `/^\d{10}(-\d{3})?$/`.

## Câu hỏi mở / chưa chốt

Không có — 4 điểm thiết kế (field bắt buộc, có `isActive` hay không, độ chặt validate `taxCode`/`email`, phạm vi unique) đã chốt với user trước khi lập plan (`docs/plans/store.md`).

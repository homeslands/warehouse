# Spec: material (danh mục vật tư + tồn kho theo kho)

## Mục tiêu

Khai báo danh mục vật tư (`MaterialType` → `Material`) và quản lý **vật tư của từng kho**: kho nào chứa vật tư nào, tồn hiện tại bao nhiêu, ngưỡng tồn tối thiểu/tối đa để cảnh báo. Dùng cho admin dựng master data và cho quản lý kho theo dõi tồn.

## Entity / dữ liệu

### `MaterialType` (`material_type_tbl`) — kế thừa `VersionedBase`

| Field | Kiểu | Bắt buộc? | Ghi chú |
|---|---|---|---|
| name | string | có | unique |
| code | string | có | unique, khoá nghiệp vụ, tự `toUpperCase()` |
| description | string | không | |

### `Material` (`material_tbl`) — kế thừa `VersionedBase`

| Field | Kiểu | Bắt buộc? | Ghi chú |
|---|---|---|---|
| code | string | có | unique, khoá nghiệp vụ, tự `toUpperCase()` |
| name | string | có | **không** unique (2 loại khác nhau được trùng tên) |
| type | FK `MaterialType` | có | `ManyToOne`, không eager |
| minimumInventory | int | có | ngưỡng MẶC ĐỊNH chung mọi kho, `>= 0`, default 0 |
| maximumInventory | int | có | ngưỡng MẶC ĐỊNH chung mọi kho, `>= minimumInventory` |

### `WarehouseMaterial` (`warehouse_material_tbl`) — kế thừa `Base`

Bảng nối kho ↔ vật tư, 1 row = 1 vật tư trong 1 kho.

| Field | Kiểu | Bắt buộc? | Ghi chú |
|---|---|---|---|
| warehouse | FK `Warehouse` | có | `ManyToOne` |
| material | FK `Material` | có | `ManyToOne` |
| quantity | int | có | tồn thực tế **của kho này**, `>= 0`, default 0 |
| minimumInventory | int | không | `null` = dùng ngưỡng của `Material` |
| maximumInventory | int | không | `null` = dùng ngưỡng của `Material` |

`UNIQUE(warehouse_id_column, material_id_column)` — 1 vật tư chỉ có đúng 1 row trong 1 kho.

**`Base` chứ không `VersionedBase`:** `quantity` là đại lượng cộng/trừ nguyên tử (sau này do phiếu nhập/xuất ghi), đúng trường hợp CLAUDE.md nói **không** dùng optimistic locking. Ngược lại `MaterialType`/`Material` là master data sửa qua form nhiều field → `VersionedBase`, giống `Warehouse`.

## Quy tắc nghiệp vụ

**Ngưỡng tồn (effective threshold):** ngưỡng thật sự áp cho 1 vật tư trong 1 kho = override trên `WarehouseMaterial` nếu khác `null`, ngược lại lấy của `Material`. Tính riêng từng vế: override `minimumInventory` mà không override `maximumInventory` là hợp lệ. Response luôn trả kèm `effectiveMinimumInventory`/`effectiveMaximumInventory` + 2 cờ `isBelowMinimum`/`isAboveMaximum` để client không phải tự tính lại.

**Ràng buộc ngưỡng:** `minimumInventory >= 0` và `maximumInventory >= minimumInventory`, kiểm ở cả `Material` lẫn override. Với override chỉ truyền 1 vế, so vế còn lại với giá trị **effective** (vế kia của `Material`) — không cho tạo ra cặp ngưỡng mâu thuẫn qua đường override.

**Tồn kho:** `quantity >= 0` mọi lúc. Điều chỉnh tồn đi qua endpoint riêng `PATCH .../quantity` với `delta` (số nguyên, âm/dương, khác 0) và ghi bằng **1 câu UPDATE có điều kiện** (`quantity = quantity + delta WHERE quantity + delta >= 0`), không đọc-rồi-ghi — 2 người điều chỉnh cùng lúc không ghi đè nhau. `delta` làm tồn âm → `WAREHOUSE_MATERIAL_QUANTITY_NEGATIVE`. Endpoint sửa ngưỡng (`PATCH`) **không** đụng `quantity`.

**Xoá / gỡ:**
- Không xoá `MaterialType` còn `Material` tham chiếu → `MATERIAL_TYPE_IN_USE`.
- Không xoá `Material` còn được gán vào bất kỳ kho nào → `MATERIAL_IN_USE`. Gỡ khỏi hết các kho rồi mới xoá được.
- Không gỡ vật tư khỏi kho khi `quantity > 0` → `WAREHOUSE_MATERIAL_QUANTITY_NOT_EMPTY`. Rào chống mất dấu tồn, giống tinh thần "không xoá kho đang `isActive`" của `warehouse`.
- Cả 3 đều là soft-delete (`Base.deletedAt`).

**Khoá nghiệp vụ `code`:** unique, tự `toUpperCase()` ở mapper (giống `Warehouse.code`) để `mt-01` và `MT-01` va nhau ở tầng check trùng thay vì thành 2 row. UNIQUE index của MySQL không bỏ qua row xoá mềm, nên check trùng phải `withDeleted` và phân biệt "đang dùng" với "bị bản ghi đã xoá giữ chỗ" — cùng pattern `assertCodeIsFree` của `warehouse.service.ts`.

**Gán vật tư vào kho:** kho phải tồn tại và `isActive`; vật tư phải tồn tại. Gán trùng (đã có row, kể cả row xoá mềm) → `WAREHOUSE_MATERIAL_DOES_EXIST`.

## Quyền truy cập

Dùng `@HasRole` (RBAC cơ bản), giống `/warehouses`. `SUPER_ADMIN` bypass.

| Action | Role |
|---|---|
| Create / Update / Delete (cả 3 entity) | `ADMIN` |
| Điều chỉnh tồn (`PATCH .../quantity`) | `ADMIN` |
| Read (list + detail, cả 3 entity) | `ADMIN`, `MANAGER`, `SUPERVISOR` |

## API cần có

**MaterialType** — `/material-types`
- `POST /material-types` — tạo
- `GET /material-types` — list phân trang (filter `code`, `name`)
- `GET /material-types/:slug` — chi tiết
- `PATCH /material-types/:slug` — sửa (kèm `version`)
- `DELETE /material-types/:slug` — xoá

**Material** — `/materials`
- `POST /materials` — tạo (body có `typeSlug`)
- `GET /materials` — list phân trang (filter `typeSlug`, `code`, `name`)
- `GET /materials/:slug` — chi tiết
- `PATCH /materials/:slug` — sửa (kèm `version`)
- `DELETE /materials/:slug` — xoá

**Vật tư của kho** — `/warehouses/:warehouseSlug/materials`
- `POST /warehouses/:warehouseSlug/materials` — gán vật tư vào kho (`materialSlug`, `quantity?`, `minimumInventory?`, `maximumInventory?`)
- `GET /warehouses/:warehouseSlug/materials` — list phân trang (filter `typeSlug`, `belowMinimum`, `aboveMaximum`)
- `PATCH /warehouses/:warehouseSlug/materials/:materialSlug` — sửa override ngưỡng
- `PATCH /warehouses/:warehouseSlug/materials/:materialSlug/quantity` — điều chỉnh tồn theo `delta`
- `DELETE /warehouses/:warehouseSlug/materials/:materialSlug` — gỡ vật tư khỏi kho

## Ngoài phạm vi (Out of scope)

- **Phiếu nhập/xuất/kiểm kho** — `PATCH .../quantity` là cửa tạm để chỉnh tồn khi chưa có phiếu; khi làm phiếu thì phiếu là nơi duy nhất đổi `quantity` và endpoint này nên bỏ.
- Lịch sử thay đổi tồn / audit log riêng cho từng lần điều chỉnh (hiện chỉ có log ứng dụng).
- Đơn vị tính (`unit`), quy cách đóng gói, giá vốn, nhà cung cấp.
- Cảnh báo/notification tự động khi tồn vượt ngưỡng — mới chỉ trả cờ `isBelowMinimum`/`isAboveMaximum` trong response.
- Khu vực (zone/bin) trong kho, điều chuyển giữa các kho.
- `MANAGER` tự sửa tồn kho mình quản lý — hiện mọi thao tác ghi đều là `ADMIN`.

## Câu hỏi mở / chưa chốt

Các giả định dưới đây tự chốt khi viết spec, đổi được nếu sai ý:

1. `Material.name` **không** unique (chỉ `code` unique) — 2 loại vật tư khác nhau được trùng tên. `MaterialType.name` thì unique.
2. `Material.maximumInventory` bắt buộc (không cho `null` = không giới hạn).
3. Gỡ vật tư khỏi kho khi còn tồn > 0 bị chặn — chưa có luồng "xuất hết rồi mới gỡ" tự động.
4. `PATCH .../quantity` nhận `delta` (cộng/trừ) chứ không nhận `quantity` tuyệt đối, để 2 lần chỉnh đồng thời không mất dấu.

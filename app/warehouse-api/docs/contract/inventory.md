# Tồn kho (Inventory)

> Nguồn: `src/inventory/inventory.controller.ts`, `src/inventory/inventory.dto.ts`, `src/inventory/inventory.validation.ts`, `src/inventory/inventory.service.ts`, `src/inventory/inventory.mapper.ts`, `src/inventory/inventory.util.ts`, `src/inventory/inventory.constants.ts`, `src/inventory/inventory.entity.ts` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).
> Mô tả code tại `main` `5555273`.

Một dòng tồn kho (`Inventory`) là một cặp (kho, vật tư). Vật tư phải được **gán vào kho** thì mới có tồn, và mới nhập/xuất qua phiếu được. Mọi route nằm dưới `/api/v1/warehouses/:warehouseSlug/materials` (`inventory.controller.ts:34`).

## Tóm tắt endpoint

| Method | Path | Quyền (authority, AND) | Mô tả |
|---|---|---|---|
| PUT | /api/v1/warehouses/:warehouseSlug/materials | `MATERIAL_UPDATE` + `WAREHOUSE_UPDATE` | Gán vật tư có sẵn vào kho |
| POST | /api/v1/warehouses/:warehouseSlug/materials | `MATERIAL_CREATE` + `MATERIAL_UPDATE` + `WAREHOUSE_UPDATE` | Tạo vật tư mới và gán vào kho (một transaction) |
| GET | /api/v1/warehouses/:warehouseSlug/materials | `MATERIAL_READ` + `WAREHOUSE_READ` | Danh sách tồn của kho (phân trang, có lọc) |
| PATCH | /api/v1/warehouses/:warehouseSlug/materials/:materialSlug | `MATERIAL_UPDATE` + `WAREHOUSE_UPDATE` | Sửa ngưỡng min/max riêng của kho |
| PATCH | /api/v1/warehouses/:warehouseSlug/materials/:materialSlug/quantity | `MATERIAL_UPDATE` + `WAREHOUSE_UPDATE` | Cộng/trừ tồn theo delta (cửa tạm) |
| DELETE | /api/v1/warehouses/:warehouseSlug/materials/:materialSlug | `MATERIAL_UPDATE` + `WAREHOUSE_UPDATE` | Gỡ vật tư khỏi kho |
| GET | /api/v1/warehouses/:warehouseSlug/materials/:materialSlug/histories | `MATERIAL_READ` + `WAREHOUSE_READ` | Lịch sử thay đổi tồn |

**Phạm vi kho:** quyền do authority quyết định (`MATERIAL_READ`, `WAREHOUSE_READ` cho đọc; `MATERIAL_UPDATE`, `WAREHOUSE_UPDATE`, `MATERIAL_CREATE` cho ghi). Module này không gắn `@WarehouseScope`. Quyền thật lấy từ `permission_tbl` lúc chạy.

## Cách tính số lượng

Mọi số lượng của module này (tồn, giữ chỗ, ngưỡng, delta, lịch sử) đều tính theo **đơn vị cơ sở** (`baseUnit`) của vật tư.

| Giá trị | Công thức / nguồn | Code |
|---|---|---|
| `quantity` | Tồn thực tế trong kho này. DB là `DECIMAL(18,6)`, trả về dạng `number` (tối đa 6 chữ số thập phân) | `inventory.entity.ts:27-43` |
| `reservedQuantity` | Lượng đã giữ chỗ cho phiếu xuất đang `PENDING` | `inventory.entity.ts:45-58` |
| `availableQuantity` | `quantity - reservedQuantity`, làm tròn 6 chữ số thập phân. Đây là lượng còn xuất được | `inventory.mapper.ts:31-32` |
| `effectiveMinimumInventory` | `minimumInventory` (override của kho) nếu khác `null`, ngược lại lấy `minimumInventory` của vật tư, ngược lại `0` | `inventory.util.ts:10-13` |
| `effectiveMaximumInventory` | Tương tự với `maximumInventory` | `inventory.util.ts:15-18` |
| `isBelowMinimum` | `quantity < effectiveMinimumInventory` (so sánh nhỏ hơn hẳn) | `inventory.mapper.ts:50-52` |
| `isAboveMaximum` | `quantity > effectiveMaximumInventory` (so sánh lớn hơn hẳn) | `inventory.mapper.ts:54-56` |

**Bất biến** do service bảo đảm (DB không có CHECK): `0 ≤ reservedQuantity ≤ quantity` (`inventory.service.ts:444-475`).

**Thao tác làm đổi số lượng.** Mỗi thao tác ghi đúng một dòng lịch sử:

| Thao tác | `quantity` | `reservedQuantity` | `action` lịch sử | Nguồn |
|---|---|---|---|---|
| Gán vật tư vào kho (`PUT`/`POST` ở trang này) | = `quantity` ban đầu | 0 | `ASSIGN` | `inventory.service.ts:103-113`, `:141-166` |
| Điều chỉnh (`PATCH .../quantity`) | `+ delta` | không đổi | `ADJUST` | `inventory.service.ts:232-258` |
| Xác nhận phiếu nhập | `+` tổng số lượng quy về đơn vị cơ sở | không đổi | `IMPORT` | `inventory.service.ts:269-281`, gọi từ `import-form.service.ts` |
| Gửi duyệt phiếu xuất (`DRAFT` → `PENDING`) | không đổi | `+` | `RESERVE` | `inventory.service.ts:312-330`, gọi từ `export-form.service.ts` |
| Huỷ phiếu xuất `PENDING` | không đổi | `−` | `RELEASE` | `inventory.service.ts:333-345` |
| Xác nhận phiếu xuất (`PENDING` → `CONFIRMED`) | `−` | `−` (cùng lượng) | `EXPORT` | `inventory.service.ts:291-305` (`fromReserved: true`) |
| Gỡ vật tư khỏi kho (`DELETE`) | phải đang = 0 | phải đang = 0 | `REMOVE` | `inventory.service.ts:384-413` |

- Nhiều dòng phiếu có cùng vật tư được cộng gộp thành một lần thay đổi và một dòng lịch sử.
- Mọi thay đổi đều khoá dòng tồn (`SELECT ... FOR UPDATE`), nên request đồng thời chạy lần lượt và không ghi đè nhau. Module này **không** dùng `version` (optimistic lock).

**Quy đổi đơn vị trong response.** `units[].conversionRate` là số đơn vị cơ sở trong 1 đơn vị đó (`src/material/material.dto.ts:211-213`). Đơn vị cơ sở có `conversionRate = 1` và `isBaseUnit = true`. API **chỉ trả số theo đơn vị cơ sở**. Nếu FE hiển thị theo đơn vị khác, FE tự chia cho `conversionRate`. Quy tắc làm tròn khi hiển thị chưa được chốt (xem Ghi chú).

## Kiểu dùng chung

### `InventoryResponseDto`

Nguồn: `inventory.dto.ts:171-241`, map ở `inventory.mapper.ts:25-107`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug` | `string` | Slug của **dòng tồn**. Các path của module dùng `materialSlug`, không dùng slug này |
| `createdAt`, `updatedAt` | `string` | Định dạng xem [conventions.md](conventions.md) |
| `quantity` | `number` | Xem "Cách tính số lượng" |
| `reservedQuantity` | `number` | |
| `availableQuantity` | `number` | |
| `minimumInventory` | `number \| null` | Override của kho. `null` = dùng ngưỡng của vật tư |
| `maximumInventory` | `number \| null` | Như trên |
| `effectiveMinimumInventory` | `number` | |
| `effectiveMaximumInventory` | `number` | |
| `isBelowMinimum` | `boolean` | |
| `isAboveMaximum` | `boolean` | |
| `warehouseSlug` | `string` | |
| `materialSlug` | `string` | |
| `materialCode` | `string` | |
| `materialName` | `string` | |
| `typeSlug` | `string?` | Slug loại vật tư |
| `typeName` | `string?` | |
| `baseUnit` | `UnitResponseDto \| null` | `{ slug, createdAt, updatedAt, name, code, description? }`. Không có `materialCount`. `null` nếu vật tư chưa có đơn vị cơ sở. Xem [unit.md](unit.md) |
| `units` | `MaterialConversionUnitResponseDto[]` | Mọi đơn vị của vật tư: đơn vị cơ sở đứng đầu, còn lại sắp theo `unitCode`. Đơn vị đã xoá mềm bị bỏ (`inventory.mapper.ts:91-106`). Phần tử: `{ unitSlug, unitCode, unitName, unit: UnitResponseDto, conversionRate: number, isBaseUnit: boolean }`. Cùng dạng `units` của `GET /materials`, xem [material.md](material.md) |

### `InventoryHistoryResponseDto`

Nguồn: `inventory.dto.ts:246-285`, map ở `inventory.mapper.ts:109-128`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug` | `string` | |
| `createdAt`, `updatedAt` | `string` | `createdAt` là thời điểm thay đổi |
| `action` | `'ASSIGN' \| 'ADJUST' \| 'IMPORT' \| 'EXPORT' \| 'RESERVE' \| 'RELEASE' \| 'REMOVE'` | `inventory.constants.ts:10-18` |
| `quantityDelta` | `number` | Dương = cộng, âm = trừ. Bằng `0` nếu không đổi |
| `quantityBefore`, `quantityAfter` | `number` | Ảnh chụp trước và sau thay đổi |
| `reservedDelta` | `number` | |
| `reservedBefore`, `reservedAfter` | `number` | |
| `note` | `string \| null` | `ADJUST`: `note` của request. `IMPORT`/`EXPORT`/`RESERVE`/`RELEASE`: ghi chú do luồng phiếu truyền vào |
| `changedBySlug` | `string?` | User thực hiện. Vẫn có nếu user đã bị xoá mềm |
| `changedByName` | `string?` | `"<lastName> <firstName>"` |

## Ràng buộc chung cho số lượng trong request

Áp cho `quantity`, `minimumInventory`, `maximumInventory`, `delta` (`src/shared/utils/decimal.validator.ts`):

- Phải là số JSON, hoặc chuỗi chuyển được thành số (DTO có `@Type(() => Number)`).
- Tối đa **6 chữ số thập phân**. Không chấp nhận dạng số mũ (`1e-7`, `1e21`).
- `quantity`, `minimumInventory`, `maximumInventory` phải `≥ 0`. `delta` được âm, nhưng khác `0`.
- Không có giới hạn trên ở tầng validate. Cột DB là `DECIMAL(18,6)`, tức tối đa 12 chữ số phần nguyên. Gửi số lớn hơn mức này thì lỗi trả về là gì chưa được xác minh, có thể là 500.

## PUT /api/v1/warehouses/:warehouseSlug/materials

- **Quyền:** `MATERIAL_UPDATE` **và** `WAREHOUSE_UPDATE` (`inventory.controller.ts:42-68`).
- **Path params:** `warehouseSlug` (`string`).
- **Body:** `AssignInventoryRequestDto` (`inventory.dto.ts:45-79`).

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `materialSlug` | `string` | Có | Trim, không rỗng | Vật tư đã có (`POST /materials`) |
| `quantity` | `number` | Không | Xem ràng buộc chung, `≥ 0` | Tồn ban đầu, mặc định `0` |
| `minimumInventory` | `number \| null` | Không | `≥ 0` | Không gửi hoặc `null` = dùng ngưỡng của vật tư |
| `maximumInventory` | `number \| null` | Không | `≥ 0` | Như trên |

- **Hành vi** (`inventory.service.ts:72-120`). Thứ tự kiểm tra: kho tồn tại → kho đang hoạt động → vật tư tồn tại → vật tư chưa từng gán vào kho → `effectiveMaximum ≥ effectiveMinimum`. Sau đó ghi dòng tồn và lịch sử `ASSIGN` trong một transaction.
- **Không idempotent:** gán lại vật tư đã có trong kho trả `INVENTORY_DOES_EXIST` (`inventory.controller.ts:40-41`).
- **Response 200** (không phải 201): `result` là `InventoryResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100803 `INVENTORY_SLUG_IS_REQUIRED` | Thiếu hoặc rỗng `materialSlug` |
| 400 | 100805 `INVENTORY_QUANTITY_INVALID` | `quantity` sai |
| 400 | 100809 `INVENTORY_MINIMUM_INVENTORY_INVALID` | `minimumInventory` sai |
| 400 | 100810 `INVENTORY_MAXIMUM_INVENTORY_INVALID` | `maximumInventory` sai |
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho, hoặc kho đã xoá |
| 422 | 100804 `INVENTORY_WAREHOUSE_INACTIVE` | Kho ngừng hoạt động |
| 404 | 100701 `MATERIAL_NOT_FOUND` | Không có vật tư (mã của module material) |
| 422 | 100802 `INVENTORY_DOES_EXIST` | Vật tư đã có trong kho, **kể cả khi đã bị gỡ** trước đó (kiểm tra `withDeleted`, `inventory.service.ts:86-90`) |
| 422 | 100811 `INVENTORY_RANGE_INVALID` | Ngưỡng hiệu lực mâu thuẫn: `effectiveMaximum < effectiveMinimum` |

## POST /api/v1/warehouses/:warehouseSlug/materials

- **Quyền:** `MATERIAL_CREATE` **và** `MATERIAL_UPDATE` **và** `WAREHOUSE_UPDATE` (`inventory.controller.ts:72-109`).
- **Path params:** `warehouseSlug` (`string`).
- **Body:** `CreateInventoryMaterialRequestDto` (`inventory.dto.ts:88-111`). Gồm các field của `PUT` **trừ** `materialSlug`, cộng thêm:

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `quantity` | `number` | Không | Như `PUT` | Tồn ban đầu, mặc định `0` |
| `minimumInventory` | `number \| null` | Không | Như `PUT` | Override **của kho này** |
| `maximumInventory` | `number \| null` | Không | Như `PUT` | Override **của kho này** |
| `material` | `object` | Có | Body của `POST /api/v1/materials` (`CreateMaterialRequestDto`), validate lồng nhau | Xem [material.md](material.md). `material.minimumInventory`/`maximumInventory` ở đây là ngưỡng **mặc định của vật tư**, khác override bên ngoài |
| `supplierSlug` | `string` | Không | Trim, chuỗi không rỗng | Gắn vật tư mới với nhà cung cấp này trong cùng transaction |

- **Hành vi** (`inventory.service.ts:129-173`): kiểm tra kho và nhà cung cấp **trước** transaction. Sau đó trong một transaction: tạo vật tư (kèm đơn vị cơ sở), gắn nhà cung cấp (nếu có), tạo dòng tồn, ghi lịch sử `ASSIGN`. Lỗi ở bước nào thì không có gì được ghi.
- **Response 201:** `result` là `InventoryResponseDto`. `units` lúc này chỉ có đơn vị cơ sở.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 100815 `INVENTORY_MATERIAL_IS_REQUIRED` | Thiếu `material`. **Chú ý: HTTP 422, không phải 400** |
| 400/422 | `MATERIAL_*` | Field trong `material` sai. Filter bỏ tiền tố `material.` và trả đúng mã của module material, xem [material.md](material.md) |
| 400 | 100816 `INVENTORY_SUPPLIER_SLUG_INVALID` | `supplierSlug` không phải chuỗi hoặc rỗng |
| 400 | 100805 / 100809 / 100810 | `quantity` / `minimumInventory` / `maximumInventory` sai |
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 422 | 100804 `INVENTORY_WAREHOUSE_INACTIVE` | Kho ngừng hoạt động |
| 404 | 101201 `SUPPLIER_NOT_FOUND` | `supplierSlug` không tồn tại (mã của module supplier) |
| 422 | 100705 `MATERIAL_CODE_DOES_EXIST` / 100706 `MATERIAL_CODE_RESERVED_BY_DELETED` | Mã vật tư trùng |
| 422 | 100710 `MATERIAL_INVENTORY_RANGE_INVALID` | Ngưỡng mặc định trong `material` mâu thuẫn |
| 404 | 100601 `MATERIAL_TYPE_NOT_FOUND` | `material.typeSlug` không tồn tại |
| 404 | 100901 `UNIT_NOT_FOUND` | `material.baseUnitSlug` không tồn tại |
| 422 | 100811 `INVENTORY_RANGE_INVALID` | Ngưỡng hiệu lực của kho mâu thuẫn |

## GET /api/v1/warehouses/:warehouseSlug/materials

- **Quyền:** `MATERIAL_READ` **và** `WAREHOUSE_READ`. Không kiểm tra phạm vi kho (`inventory.controller.ts:111-128`).
- **Path params:** `warehouseSlug` (`string`).
- **Query:** `GetInventoryRequestDto` (`inventory.dto.ts:152-169`), kế thừa `BaseQueryDto`.

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `page`, `size` | `number` | Không | Xem conventions | |
| `sort`, `startDate`, `endDate` | | Không | Được validate | **Bị bỏ qua**: luôn `createdAt DESC` (thời điểm gán vào kho), không lọc ngày (`inventory.service.ts:198-204`) |
| `typeSlug` | `string` | Không | Trim | Lọc theo slug loại vật tư. Slug không tồn tại thì trả danh sách rỗng, không báo lỗi |
| `belowMinimum` | `boolean` | Không | `"true"`/`"false"` | `true`: chỉ lấy dòng có `quantity < COALESCE(override min, min của vật tư)`. `false` hoặc không gửi: **không lọc** |
| `aboveMaximum` | `boolean` | Không | `"true"`/`"false"` | `true`: chỉ lấy dòng có `quantity > COALESCE(override max, max của vật tư)`. `false` hoặc không gửi: không lọc |

- Bộ lọc chạy ở SQL (`inventory.service.ts:186-196`), nên `total` và phân trang đúng theo bộ lọc. Gửi cả `belowMinimum=true` và `aboveMaximum=true` là điều kiện **AND**, gần như luôn rỗng.
- Không gồm vật tư đã gỡ khỏi kho.
- **Response 200:** trang phân trang của `InventoryResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 400 | *(không có `code`)* | `belowMinimum`/`aboveMaximum` không phải boolean. Decorator `@IsBoolean()` không đặt key lỗi, nên response có `message` là câu mặc định của class-validator (ví dụ `"belowMinimum must be a boolean value"`) và không có `code` (`inventory.dto.ts:158-168`, `src/app/http-exception.filter.ts:34-41`) |

## PATCH /api/v1/warehouses/:warehouseSlug/materials/:materialSlug

- **Quyền:** `MATERIAL_UPDATE` **và** `WAREHOUSE_UPDATE` (`inventory.controller.ts:130-162`).
- **Path params:** `warehouseSlug` (`string`), `materialSlug` (`string`): slug **vật tư**.
- **Body:** `UpdateInventoryRequestDto` (`inventory.dto.ts:113-129`). Endpoint này **không** nhận `quantity`.

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `minimumInventory` | `number \| null` | Không | `≥ 0`, tối đa 6 chữ số thập phân | Không gửi: giữ nguyên. `null`: bỏ override, quay về ngưỡng của vật tư |
| `maximumInventory` | `number \| null` | Không | Như trên | Như trên |

Ở endpoint này `null` **có ý nghĩa** (`inventory.service.ts:221-224`), khác với PATCH của kho và cửa hàng.

- Không kiểm tra kho có đang hoạt động hay không.
- **Response 200:** `result` là `InventoryResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100809 / 100810 | Ngưỡng sai |
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 404 | 100801 `INVENTORY_NOT_FOUND` | Kho có, nhưng vật tư chưa gán vào kho (hoặc đã gỡ, hoặc slug vật tư sai) (`inventory.service.ts:509-520`) |
| 422 | 100811 `INVENTORY_RANGE_INVALID` | Ngưỡng hiệu lực sau khi sửa mâu thuẫn |

## PATCH /api/v1/warehouses/:warehouseSlug/materials/:materialSlug/quantity

- **Quyền:** `MATERIAL_UPDATE` **và** `WAREHOUSE_UPDATE` (`inventory.controller.ts:164-201`).
- Code ghi đây là **cửa tạm**, dùng cho tới khi có phiếu nhập/xuất (`inventory.controller.ts:173-174`).
- **Path params:** `warehouseSlug`, `materialSlug` (`string`).
- **Body:** `AdjustInventoryQuantityRequestDto` (`inventory.dto.ts:131-150`).

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `delta` | `number` | Có | Khác `0`, tối đa 6 chữ số thập phân, được âm | Lượng cộng (dương) hoặc trừ (âm), theo **đơn vị cơ sở** |
| `note` | `string` | Không | Trim, tối đa 255 ký tự | Lưu vào lịch sử `ADJUST` |

- **Hành vi** (`inventory.service.ts:232-258`, `:444-475`): khoá dòng tồn, tính `quantity + delta`, kiểm tra bất biến, ghi giá trị mới và một dòng lịch sử `ADJUST`.
- Không kiểm tra kho có đang hoạt động hay không.
- **Response 200:** `result` là `InventoryResponseDto` sau khi điều chỉnh.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100808 `INVENTORY_DELTA_INVALID` | Thiếu `delta`, không phải số, quá 6 chữ số thập phân, hoặc bằng `0` (kiểm tra `0` ở service, `inventory.service.ts:242-244`) |
| 400 | 100814 `INVENTORY_NOTE_INVALID` | `note` không phải chuỗi, hoặc dài hơn 255 ký tự |
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 404 | 100801 `INVENTORY_NOT_FOUND` | Vật tư chưa gán vào kho, hoặc bị gỡ trong lúc đang xử lý |
| 422 | 100806 `INVENTORY_QUANTITY_NEGATIVE` | `quantity + delta < 0` |
| 422 | 100812 `INVENTORY_QUANTITY_BELOW_RESERVED` | `quantity + delta < reservedQuantity`. Không được trừ lấn vào phần đã giữ chỗ |

## DELETE /api/v1/warehouses/:warehouseSlug/materials/:materialSlug

- **Quyền:** `MATERIAL_UPDATE` **và** `WAREHOUSE_UPDATE` (`inventory.controller.ts:203-228`).
- **Path params:** `warehouseSlug`, `materialSlug` (`string`).
- **Hành vi** (`inventory.service.ts:384-413`): khoá dòng tồn, yêu cầu `quantity = 0` và `reservedQuantity = 0`, ghi lịch sử `REMOVE`, rồi xoá mềm dòng tồn.
- Sau khi gỡ:
  - Vật tư **không gán lại được** vào kho này: `PUT` trả `INVENTORY_DOES_EXIST`.
  - Lịch sử của dòng đó **không đọc được** nữa: `GET .../histories` trả `INVENTORY_NOT_FOUND`.
- **Response 200:** `result` là chuỗi `"1 inventory have been removed successfully"`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 404 | 100801 `INVENTORY_NOT_FOUND` | Vật tư chưa gán vào kho |
| 422 | 100807 `INVENTORY_QUANTITY_NOT_EMPTY` | `quantity > 0` |
| 422 | 100813 `INVENTORY_RESERVED_NOT_EMPTY` | `reservedQuantity > 0`, tức đang có phiếu xuất `PENDING` |

## GET /api/v1/warehouses/:warehouseSlug/materials/:materialSlug/histories

- **Quyền:** `MATERIAL_READ` **và** `WAREHOUSE_READ`. Không kiểm tra phạm vi kho (`inventory.controller.ts:230-249`).
- **Path params:** `warehouseSlug`, `materialSlug` (`string`).
- **Query:** `GetInventoryHistoryRequestDto` = `BaseQueryDto`. `page`, `size` có tác dụng. `sort`, `startDate`, `endDate` **bị bỏ qua** (luôn `createdAt DESC`, `inventory.service.ts:415-437`).
- **Response 200:** trang phân trang của `InventoryHistoryResponseDto`, mới nhất trước. Lịch sử chỉ được thêm, không sửa hay xoá được qua API.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 404 | 100801 `INVENTORY_NOT_FOUND` | Vật tư chưa gán vào kho, hoặc đã bị gỡ |

## Mã lỗi của module

Nguồn: `src/inventory/inventory.validation.ts:45-117` (`InventoryValidation`, dải 1008xx). HTTP mặc định của `createErrorCode` là 422.

| Key | code | HTTP | message |
|---|---|---|---|
| `INVENTORY_NOT_FOUND` | 100801 | 404 | Material is not assigned to this warehouse |
| `INVENTORY_DOES_EXIST` | 100802 | 422 | Material is already assigned to this warehouse |
| `INVENTORY_SLUG_IS_REQUIRED` | 100803 | 400 | materialSlug is required |
| `INVENTORY_WAREHOUSE_INACTIVE` | 100804 | 422 | Cannot manage materials of an inactive warehouse |
| `INVENTORY_QUANTITY_INVALID` | 100805 | 400 | quantity must be an integer >= 0 |
| `INVENTORY_QUANTITY_NEGATIVE` | 100806 | 422 | The adjustment would make the stock quantity negative |
| `INVENTORY_QUANTITY_NOT_EMPTY` | 100807 | 422 | Stock quantity must be 0 before removing the material from the warehouse |
| `INVENTORY_DELTA_INVALID` | 100808 | 400 | delta must be a non-zero integer |
| `INVENTORY_MINIMUM_INVENTORY_INVALID` | 100809 | 400 | minimumInventory must be an integer >= 0, or null to fall back to the material default |
| `INVENTORY_MAXIMUM_INVENTORY_INVALID` | 100810 | 400 | maximumInventory must be an integer >= 0, or null to fall back to the material default |
| `INVENTORY_RANGE_INVALID` | 100811 | 422 | The effective maximumInventory must be greater than or equal to the effective minimumInventory |
| `INVENTORY_QUANTITY_BELOW_RESERVED` | 100812 | 422 | The adjustment would make the stock quantity lower than the reserved quantity |
| `INVENTORY_RESERVED_NOT_EMPTY` | 100813 | 422 | Reserved quantity must be 0 before removing the material from the warehouse |
| `INVENTORY_NOTE_INVALID` | 100814 | 400 | note must be a string of at most 255 characters |
| `INVENTORY_MATERIAL_IS_REQUIRED` | 100815 | 422 | material is required |
| `INVENTORY_SUPPLIER_SLUG_INVALID` | 100816 | 400 | supplierSlug must be a non-empty string |
| `INVENTORY_AVAILABLE_INSUFFICIENT` | 100817 | 409 | Not enough available stock (quantity - reserved) in the warehouse |

- Các message của 100805, 100808, 100809, 100810 ghi "integer", nhưng code **chấp nhận số thập phân tới 6 chữ số**. FE không nên hiển thị nguyên message này cho người dùng.
- `INVENTORY_AVAILABLE_INSUFFICIENT` (409) không trả từ endpoint nào của trang này. Nó được trả khi gửi duyệt phiếu xuất, xem [export-form.md](export-form.md). `INVENTORY_NOT_FOUND`, `INVENTORY_QUANTITY_NEGATIVE`, `INVENTORY_QUANTITY_BELOW_RESERVED` cũng có thể đến từ luồng xác nhận phiếu nhập/xuất.

## Ghi chú cho FE

- **Đơn vị:** mọi số lượng là đơn vị cơ sở. Khi cho người dùng nhập theo đơn vị khác, FE phải tự quy về đơn vị cơ sở trước khi gửi `delta`. Kết quả quy đổi phải có tối đa 6 chữ số thập phân, nếu không sẽ bị `INVENTORY_DELTA_INVALID`.
- **Số thập phân:** server làm tròn 6 chữ số. FE nên tránh cộng trừ float rồi so sánh bằng; dùng `availableQuantity` do server trả.
- **"Còn xuất được"** là `availableQuantity`, không phải `quantity`.
- **Ngưỡng:** hiển thị `effective*`. `minimumInventory`/`maximumInventory` chỉ là override (có thể `null`). Muốn bỏ override thì gửi `null`.
- **Gỡ vật tư là thao tác một chiều:** sau khi gỡ thì không gán lại được và không xem được lịch sử (xem `DELETE`).
- **Kho ngừng hoạt động:** chặn gán vật tư (`PUT`/`POST`), nhưng **không** chặn sửa ngưỡng, điều chỉnh tồn hay gỡ.
- **`PUT` trả 200, `POST` trả 201.**
- **Path dùng `materialSlug`** (slug vật tư), không dùng `slug` của dòng tồn.
- **Phạm vi:** FE chỉ hiện các kho của user, lấy danh sách từ `GET /warehouses` hoặc `GET /auth/me`.

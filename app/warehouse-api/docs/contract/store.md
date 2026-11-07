# Cửa hàng (Store)

> Nguồn: `src/store/store.controller.ts`, `src/store/store.dto.ts`, `src/store/store.validation.ts`, `src/store/store.service.ts`, `src/store/store.mapper.ts`, `src/store/store.constants.ts` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).
> Mô tả code tại `main` `5555273`.

Mỗi cửa hàng gắn với **tối đa một kho**, và mỗi kho thuộc **tối đa một cửa hàng** (UNIQUE `store_tbl.warehouse_id_column`). Cửa hàng không có cột quản lý riêng: `manager` của cửa hàng là manager của kho đang gắn.

## Tóm tắt endpoint

| Method | Path | Quyền (authority, AND) | Mô tả |
|---|---|---|---|
| POST | /api/v1/stores | `STORE_CREATE` | Tạo cửa hàng |
| GET | /api/v1/stores | `STORE_READ` | Danh sách cửa hàng (phân trang, MANAGER/SUPERVISOR bị giới hạn) |
| GET | /api/v1/stores/:slug | `STORE_READ` | Chi tiết cửa hàng |
| PATCH | /api/v1/stores/:slug | `STORE_UPDATE` | Sửa thông tin cửa hàng (partial) |
| PUT | /api/v1/stores/:slug/warehouse | `STORE_UPDATE` + `WAREHOUSE_UPDATE` | Gắn hoặc gỡ (`null`) kho của cửa hàng |
| GET | /api/v1/stores/:slug/warehouse-histories | `STORE_READ` + `WAREHOUSE_READ` | Lịch sử gắn kho |
| POST | /api/v1/stores/:slug/warehouse-histories/:historySlug/restore | `STORE_UPDATE` + `WAREHOUSE_UPDATE` | Khôi phục kho cũ theo một dòng lịch sử |
| DELETE | /api/v1/stores/:slug | `STORE_DELETE` | Xoá mềm cửa hàng (phải ngừng hoạt động trước) |

Không endpoint nào của module này dùng `@WarehouseScope`. Seed mặc định: `STORE_READ` cấp cho `ADMIN`, `MANAGER`, `SUPERVISOR`. `STORE_CREATE`, `STORE_UPDATE`, `STORE_DELETE` chỉ cấp cho `ADMIN` (`src/migrations/1783728000026-seed-store-authorities.ts:13-38`). Quyền thật lấy từ `permission_tbl` lúc chạy.

## Kiểu dùng chung

### `StoreResponseDto`

Nguồn: `store.dto.ts:139-192`, map ở `store.mapper.ts:67-96`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug` | `string` | |
| `createdAt`, `updatedAt` | `string` | Định dạng xem [conventions.md](conventions.md) |
| `name` | `string` | |
| `code` | `string` | Luôn viết HOA |
| `legalName` | `string` | Tên pháp nhân in trên hoá đơn |
| `taxCode` | `string` | |
| `invoiceAddress` | `string?` | |
| `phonenumber` | `string?` | |
| `email` | `string?` | Luôn viết thường |
| `address` | `string?` | Địa chỉ thực tế, có thể khác `invoiceAddress` |
| `isActive` | `boolean` | |
| `warehouseSlug` | `string?` | Bỏ field khi chưa gắn kho |
| `warehouseName` | `string?` | Bỏ field khi chưa gắn kho |
| `manager` | `{ slug, phonenumber, firstName, lastName }?` | Manager của kho đang gắn. Bỏ field khi chưa gắn kho hoặc kho chưa có manager. Cùng dạng `WarehouseUserDto` ở [warehouse.md](warehouse.md) |

Field optional là `NULL` trong DB: có thể bị bỏ hoặc trả `null` (chưa xác minh).

### `StoreWarehouseHistoryResponseDto`

Nguồn: `store.dto.ts:200-237`, map ở `store.mapper.ts:98-141`. Mọi quan hệ được trả dưới dạng `slug`/`name`, kể cả khi bản ghi liên quan đã bị xoá mềm.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug` | `string` | Dùng làm `:historySlug` khi restore |
| `createdAt`, `updatedAt` | `string` | `createdAt` là thời điểm thay đổi |
| `action` | `'ASSIGN' \| 'UNASSIGN' \| 'RELEASED' \| 'RESTORE'` | Xem bảng bên dưới (`store.constants.ts:22-27`) |
| `previousWarehouseSlug`, `previousWarehouseName` | `string?` | Kho trước thay đổi, cũng là kho đích khi restore. Không có field = trước đó chưa gắn kho |
| `newWarehouseSlug`, `newWarehouseName` | `string?` | Kho sau thay đổi. Không có field = đã gỡ kho |
| `relatedStoreSlug`, `relatedStoreName` | `string?` | `RELEASED`: cửa hàng đã lấy kho. `ASSIGN`/`RESTORE`: cửa hàng bị lấy kho (nếu có) |
| `restoredFromSlug` | `string?` | Chỉ có với `RESTORE`: slug dòng lịch sử đã được khôi phục |
| `changedBySlug` | `string?` | User thực hiện |
| `changedByName` | `string?` | `"<lastName> <firstName>"` (`store.mapper.ts:135-139`) |

| `action` | Ý nghĩa |
|---|---|
| `ASSIGN` | Gắn kho mới, kể cả đổi từ kho này sang kho khác |
| `UNASSIGN` | Gỡ kho (`warehouseSlug: null`) |
| `RELEASED` | Kho của cửa hàng này bị cửa hàng khác lấy đi. Dòng này ghi trên cửa hàng **mất** kho |
| `RESTORE` | Khôi phục về `previousWarehouse` của một dòng lịch sử |

## POST /api/v1/stores

- **Quyền:** `STORE_CREATE` (`store.controller.ts:38-58`).
- **Body:** `CreateStoreRequestDto` (`store.dto.ts:30-98`). Mọi chuỗi đều được trim.

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `name` | `string` | Có | Không rỗng | Không trùng cửa hàng **chưa xoá** |
| `code` | `string` | Có | Regex `^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$` (`store.constants.ts:5`) | Lưu dạng viết HOA. Không trùng **mọi** cửa hàng, kể cả đã xoá |
| `legalName` | `string` | Có | Không rỗng | |
| `taxCode` | `string` | Có | Regex `^\d{10}(-\d{3})?$`, ví dụ `0101234567` hoặc `0101234567-001` (`store.constants.ts:13`). Không kiểm tra checksum | Không trùng cửa hàng **chưa xoá** |
| `invoiceAddress` | `string` | Không | | |
| `phonenumber` | `string` | Không | Regex `^0\d{8,10}$` (`store.constants.ts:7`) | |
| `email` | `string` | Không | Email hợp lệ | Lưu dạng viết thường (`store.mapper.ts:49-52`) |
| `address` | `string` | Không | | |
| `isActive` | `boolean` | Không | `true`/`false` hoặc `"true"`/`"false"` | Mặc định `true` |

Không gắn kho lúc tạo. Dùng `PUT /stores/:slug/warehouse`.

- **Response 201:** `result` là `StoreResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 101002 `STORE_NAME_IS_REQUIRED` | Thiếu hoặc rỗng `name` |
| 400 | 101004 `STORE_CODE_IS_REQUIRED` / 101005 `STORE_CODE_INVALID` | Thiếu, rỗng hoặc sai format `code`. Khi rỗng, mã nào được trả phụ thuộc thứ tự lỗi (chưa xác minh) |
| 400 | 101008 `STORE_LEGAL_NAME_IS_REQUIRED` | Thiếu hoặc rỗng `legalName` |
| 400 | 101009 `STORE_TAX_CODE_IS_REQUIRED` / 101010 `STORE_TAX_CODE_INVALID` | Thiếu, rỗng hoặc sai format `taxCode` |
| 400 | 101012 `STORE_PHONENUMBER_INVALID` | `phonenumber` sai format |
| 400 | 101013 `STORE_EMAIL_INVALID` | `email` sai format |
| 400 | 101014 `STORE_IS_ACTIVE_INVALID` | `isActive` không phải boolean |
| 422 | 101006 `STORE_CODE_DOES_EXIST` | `code` trùng cửa hàng đang tồn tại |
| 422 | 101007 `STORE_CODE_RESERVED_BY_DELETED_STORE` | `code` trùng cửa hàng đã xoá mềm |
| 422 | 101003 `STORE_NAME_DOES_EXIST` | `name` trùng cửa hàng chưa xoá |
| 422 | 101011 `STORE_TAX_CODE_DOES_EXIST` | `taxCode` trùng cửa hàng chưa xoá |

Thứ tự kiểm tra trong service: `code`, rồi `name`, rồi `taxCode` (`store.service.ts:70-72`).

## GET /api/v1/stores

- **Quyền:** `STORE_READ` (`store.controller.ts:60-82`). Phạm vi (`store.service.ts:84-114`):
  - Role `MANAGER` hoặc `SUPERVISOR` (`WAREHOUSE_SCOPED_ROLES`, `src/warehouse/warehouse.constants.ts:16`): chỉ thấy cửa hàng gắn với kho mình là manager hoặc thành viên. Cửa hàng chưa gắn kho **không** hiện với họ.
  - **Mọi role khác** (`ADMIN`, `SUPER_ADMIN`, role tự tạo, token không có claim `role`): thấy **toàn bộ**. Cách này ngược với `GET /warehouses`, nơi role lạ bị giới hạn.
- **Query:** `GetAllStoreRequestDto` (`store.dto.ts:131-137`), kế thừa `BaseQueryDto`.

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `page`, `size` | `number` | Không | Xem conventions | |
| `sort`, `startDate`, `endDate` | | Không | Được validate | **Bị bỏ qua**: luôn `createdAt DESC`, không lọc ngày (`store.service.ts:105-111`) |
| `isActive` | `boolean` | Không | `"true"`/`"false"` | |

- **Response 200:** trang phân trang của `StoreResponseDto`. Không gồm cửa hàng đã xoá.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 101014 `STORE_IS_ACTIVE_INVALID` | `isActive` không phải boolean |

## GET /api/v1/stores/:slug

- **Quyền:** `STORE_READ`. Endpoint không áp phạm vi kho (`store.controller.ts:84-98`, `store.service.ts:116-123`).
- **Path params:** `slug` (`string`).
- **Response 200:** `result` là `StoreResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 101001 `STORE_NOT_FOUND` | Không có cửa hàng, hoặc đã xoá mềm |

## PATCH /api/v1/stores/:slug

- **Quyền:** `STORE_UPDATE` (`store.controller.ts:100-118`).
- **Path params:** `slug` (`string`).
- **Body:** `UpdateStoreRequestDto` (`store.dto.ts:105-116`). Mọi field của `POST` đều thành không bắt buộc, cùng ràng buộc khi có gửi. Không nhận kho, đổi kho dùng `PUT .../warehouse`.
  - Field không gửi hoặc gửi `null` thì giữ nguyên (`pickDefined`, `store.service.ts:135`). Hệ quả: **không xoá được** field optional bằng `null`. Với `invoiceAddress`, `address` có thể gửi `""`. Với `phonenumber`, `email` thì gửi `""` sẽ bị lỗi format, nên không xoá được.
  - `isActive` không gửi thì giữ nguyên.
- **Response 200:** `result` là `StoreResponseDto`.
- **Lỗi riêng:** như `POST` (trừ lỗi "thiếu field"), cộng thêm:

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 101001 `STORE_NOT_FOUND` | Không có cửa hàng |
| 422 | 101006 / 101007 / 101003 / 101011 | `code`/`name`/`taxCode` mới trùng. Chỉ kiểm tra khi giá trị thật sự đổi (`store.service.ts:139-142`) |

Không có optimistic lock (`version`).

## PUT /api/v1/stores/:slug/warehouse

- **Quyền:** `STORE_UPDATE` **và** `WAREHOUSE_UPDATE` (`store.controller.ts:122-144`).
- **Path params:** `slug` (`string`).
- **Body:** `AssignStoreWarehouseRequestDto` (`store.dto.ts:118-129`).

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `warehouseSlug` | `string \| null` | Có (phải có key) | Không rỗng nếu là chuỗi. Không trim | `null` để gỡ kho |

- **Hành vi** (`store.service.ts:157-173`, `:250-320`). Toàn bộ chạy trong một transaction và khoá dòng cửa hàng (`SELECT ... FOR UPDATE`):
  1. Kho đích phải tồn tại (chưa xoá) và đang hoạt động.
  2. Kho đích đã là kho hiện tại (hoặc gửi `null` khi chưa gắn): **không ghi gì**, không tạo dòng lịch sử, trả 200.
  3. Kho đích đang thuộc cửa hàng khác (kể cả cửa hàng đã xoá mềm): kho được **gỡ khỏi cửa hàng đó** (ghi `RELEASED` cho cửa hàng kia), rồi gắn vào cửa hàng này. Không báo lỗi.
  4. Ghi một dòng lịch sử cho cửa hàng này: `ASSIGN`, hoặc `UNASSIGN` nếu `null`.
- **Response 200:** `result` là `StoreResponseDto` với kho mới. `updatedAt` có thể vẫn là giá trị trước khi ghi, vì entity trả về không được đọc lại sau `update` (chưa xác minh).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 101017 `STORE_WAREHOUSE_SLUG_IS_REQUIRED` | Không có key `warehouseSlug`, hoặc là `""` |
| 404 | 101001 `STORE_NOT_FOUND` | Không có cửa hàng |
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho, hoặc kho đã xoá (mã của module warehouse) |
| 422 | 101018 `STORE_WAREHOUSE_INACTIVE` | Kho đang ngừng hoạt động |

## GET /api/v1/stores/:slug/warehouse-histories

- **Quyền:** `STORE_READ` **và** `WAREHOUSE_READ`. Không giới hạn phạm vi (`store.controller.ts:146-164`).
- **Path params:** `slug` (`string`).
- **Query:** `GetStoreWarehouseHistoryRequestDto` = `BaseQueryDto`. `page`, `size` có tác dụng. `sort`, `startDate`, `endDate` **bị bỏ qua** (luôn `createdAt DESC`, `store.service.ts:175-197`).
- **Response 200:** trang phân trang của `StoreWarehouseHistoryResponseDto`, mới nhất trước.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 101001 `STORE_NOT_FOUND` | Không có cửa hàng, hoặc đã xoá mềm |

## POST /api/v1/stores/:slug/warehouse-histories/:historySlug/restore

- **Quyền:** `STORE_UPDATE` **và** `WAREHOUSE_UPDATE` (`store.controller.ts:167-188`).
- **Path params:** `slug` (`string`): slug cửa hàng. `historySlug` (`string`): `slug` của một dòng lịch sử **thuộc cửa hàng này**.
- **Body:** không có.
- **Hành vi** (`store.service.ts:204-230`): đưa cửa hàng về `previousWarehouse` của dòng lịch sử, theo đúng luồng của `PUT .../warehouse` (cùng điều kiện, cùng cách lấy kho từ cửa hàng khác).
  - `previousWarehouse` rỗng: gỡ kho.
  - Ghi lịch sử `RESTORE` với `restoredFromSlug`, nên lần restore này cũng có thể restore lại.
  - Nếu kho đích trùng kho hiện tại: không ghi gì.
- **Response 200:** `result` là `StoreResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 101021 `STORE_WAREHOUSE_HISTORY_NOT_FOUND` | Không có dòng lịch sử, hoặc dòng đó thuộc cửa hàng khác |
| 404 | 101001 `STORE_NOT_FOUND` | Cửa hàng không tồn tại hoặc đã xoá mềm |
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Kho cũ đã bị xoá mềm |
| 422 | 101018 `STORE_WAREHOUSE_INACTIVE` | Kho cũ đang ngừng hoạt động |

## DELETE /api/v1/stores/:slug

- **Quyền:** `STORE_DELETE` (`store.controller.ts:190-204`).
- **Path params:** `slug` (`string`).
- **Hành vi:** xoá mềm. Cửa hàng phải đang `isActive = false` (`store.service.ts:232-243`).
  - Kho đang gắn **không** được gỡ: cửa hàng đã xoá vẫn giữ kho.
  - Gắn kho đó cho cửa hàng khác vẫn được (luồng `RELEASED`).
- **Response 200:** `result` là chuỗi `"1 store have been deleted successfully"`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 101001 `STORE_NOT_FOUND` | Không có cửa hàng |
| 422 | 101016 `STORE_ACTIVE_CANNOT_BE_DELETED` | Cửa hàng đang hoạt động |

## Mã lỗi của module

Nguồn: `src/store/store.validation.ts:47-110` (`StoreValidation`, dải 1010xx). HTTP mặc định của `createErrorCode` là 422.

| Key | code | HTTP | message |
|---|---|---|---|
| `STORE_NOT_FOUND` | 101001 | 404 | Store not found |
| `STORE_NAME_IS_REQUIRED` | 101002 | 400 | Store name is required |
| `STORE_NAME_DOES_EXIST` | 101003 | 422 | Store name does exist |
| `STORE_CODE_IS_REQUIRED` | 101004 | 400 | Store code is required |
| `STORE_CODE_INVALID` | 101005 | 400 | Store code must be 2-32 characters of letters, digits or hyphen (e.g. ST-HN-01) |
| `STORE_CODE_DOES_EXIST` | 101006 | 422 | Store code does exist |
| `STORE_CODE_RESERVED_BY_DELETED_STORE` | 101007 | 422 | Store code is still held by a deleted store |
| `STORE_LEGAL_NAME_IS_REQUIRED` | 101008 | 400 | Store legal name is required |
| `STORE_TAX_CODE_IS_REQUIRED` | 101009 | 400 | Store tax code is required |
| `STORE_TAX_CODE_INVALID` | 101010 | 400 | Store tax code must be 10 digits with an optional 3-digit branch suffix (e.g. 0101234567-001) |
| `STORE_TAX_CODE_DOES_EXIST` | 101011 | 422 | Store tax code does exist |
| `STORE_PHONENUMBER_INVALID` | 101012 | 400 | Store phone number is invalid |
| `STORE_EMAIL_INVALID` | 101013 | 400 | Store email is invalid |
| `STORE_IS_ACTIVE_INVALID` | 101014 | 400 | isActive must be a boolean |
| `STORE_ACTIVE_CANNOT_BE_DELETED` | 101016 | 422 | Deactivate the store before deleting it |
| `STORE_WAREHOUSE_SLUG_IS_REQUIRED` | 101017 | 400 | Warehouse slug is required (send null to unassign) |
| `STORE_WAREHOUSE_INACTIVE` | 101018 | 422 | The warehouse is inactive and cannot be assigned to a store |
| `STORE_WAREHOUSE_HISTORY_NOT_FOUND` | 101021 | 404 | Store warehouse history entry not found |

- Mã 101015 không có trong code.
- Mã 101019 (`STORE_WAREHOUSE_ALREADY_ASSIGNED`) và 101020 (`STORE_WAREHOUSE_RESERVED_BY_DELETED_STORE`) **đã bỏ** và không dùng lại (`store.validation.ts:102-104`). Nếu FE còn xử lý hai mã này thì có thể bỏ.

## Ghi chú cho FE

- **Gắn kho đã có chủ không còn lỗi.** Kho bị chuyển sang cửa hàng mới, và cửa hàng cũ có dòng `RELEASED`. Nếu muốn hỏi người dùng trước khi chuyển, FE tự kiểm tra trước (ví dụ xem `GET /warehouses/:slug` hoặc danh sách cửa hàng). API không có bước xác nhận.
- **Phạm vi:** chỉ `GET /stores` lọc theo kho của MANAGER/SUPERVISOR. FE quyết định hiện nút theo authority của user, không theo việc cửa hàng có trong danh sách hay không.
- **Lịch sử** vẫn hiện tên và slug của kho hay cửa hàng đã bị xoá mềm.
- **Không có optimistic lock.** Thao tác gắn kho dùng khoá dòng ở DB, hai request đồng thời chạy lần lượt.
- `sort`/`startDate`/`endDate` không có tác dụng ở mọi danh sách của module này.

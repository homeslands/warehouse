# Nhà cung cấp (Supplier)

> Nguồn: `src/supplier/supplier.controller.ts`, `src/supplier/supplier.dto.ts`, `src/supplier/supplier.validation.ts`, `src/supplier/supplier.service.ts`, `src/supplier/supplier.mapper.ts`, `src/supplier/supplier.constants.ts` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).
> Đối chiếu code tại `origin/main` 814c015.

## Tóm tắt endpoint

| Method | Path | Quyền (authority, AND) | Mô tả |
|---|---|---|---|
| POST | /api/v1/suppliers | `SUPPLIER_CREATE` | Tạo nhà cung cấp |
| GET | /api/v1/suppliers | `SUPPLIER_READ` | Danh sách nhà cung cấp |
| GET | /api/v1/suppliers/:slug | `SUPPLIER_READ` | Chi tiết |
| PATCH | /api/v1/suppliers/:slug | `SUPPLIER_UPDATE` | Sửa một phần |
| DELETE | /api/v1/suppliers/:slug | `SUPPLIER_DELETE` | Xoá mềm, bị chặn khi còn vật tư gắn |
| GET | /api/v1/suppliers/:slug/materials | `SUPPLIER_READ` + `MATERIAL_READ` | Vật tư của nhà cung cấp |
| PUT | /api/v1/suppliers/:slug/materials | `SUPPLIER_UPDATE` + `MATERIAL_UPDATE` | Gắn nhiều vật tư cùng lúc |
| DELETE | /api/v1/suppliers/:slug/materials | `SUPPLIER_UPDATE` + `MATERIAL_UPDATE` | Gỡ nhiều vật tư cùng lúc |

Tổng cộng 8 endpoint. Route giao dịch nhà cung cấp (`GET/POST /suppliers/:slug/transactions`) **chưa được mở**: controller đang tạm ẩn (`supplier.controller.ts:217-220`), dù service và DTO vẫn còn. Không route nào có `@WarehouseScope` hay `@Public`.

## Kiểu dữ liệu dùng chung

### SupplierResponseDto

Khai báo ở `supplier.dto.ts:136-168`, map ở `supplier.mapper.ts:62` (`baseMapper`, không trả `id`).

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug | string (slug) | |
| createdAt, updatedAt | string | Định dạng: xem conventions.md |
| code | string | IN HOA |
| name | string | Không unique |
| taxCode | string \| null | |
| phonenumber | string \| null | |
| email | string \| null | Chữ thường (`supplier.mapper.ts:40-43`) |
| address | string \| null | |
| contactPerson | string \| null | |
| note | string \| null | Không được trim |

### SupplierMaterialResponseDto

Bản rút gọn của vật tư: `supplier.dto.ts:227-247`, map ở `supplier.mapper.ts:64-85`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug, createdAt, updatedAt | string | Slug và thời gian **của vật tư** |
| code | string | Mã vật tư |
| name | string | Tên vật tư |
| typeSlug | string | Slug loại vật tư |
| typeName | string | Tên loại vật tư |
| baseUnitSlug | string \| undefined | Không có khi vật tư chưa có đơn vị cơ sở |
| baseUnitName | string \| undefined | Như trên |

## POST /api/v1/suppliers

- **Quyền:** `SUPPLIER_CREATE` (`supplier.controller.ts:38`).
- **Body** (`CreateSupplierRequestDto`, `supplier.dto.ts:35-86`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| code | string | có | `^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$` (2-32 ký tự, `supplier.constants.ts:5`) | Server trim rồi chuyển sang IN HOA. Unique tính cả bản ghi đã xoá mềm |
| name | string | có | khác rỗng | |
| taxCode | string | không | `^\d{10}(-\d{3})?$` (`supplier.constants.ts:13`) | Unique trong các nhà cung cấp chưa xoá |
| phonenumber | string | không | `^0\d{8,10}$`: bắt đầu bằng `0`, tổng 9-11 chữ số (`supplier.constants.ts:7`) | |
| email | string | không | `IsEmail` | Server chuyển sang chữ thường |
| address | string | không | — | Được trim |
| contactPerson | string | không | — | Được trim |
| note | string | không | — | Giữ nguyên, không trim |

- **Response 201:** [SupplierResponseDto](#supplierresponsedto).
- **Lỗi riêng** (`supplier.service.ts:73-83`):

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101203 `SUPPLIER_CODE_IS_REQUIRED` | Thiếu `code` hoặc `code` rỗng |
| 422 | 101204 `SUPPLIER_CODE_INVALID` | `code` sai định dạng |
| 422 | 101202 `SUPPLIER_NAME_IS_REQUIRED` | Thiếu `name` hoặc `name` rỗng |
| 422 | 101207 `SUPPLIER_TAX_CODE_INVALID` | `taxCode` sai định dạng, kể cả khi gửi `""` |
| 422 | 101209 `SUPPLIER_PHONENUMBER_INVALID` | `phonenumber` sai định dạng, kể cả khi gửi `""` |
| 422 | 101210 `SUPPLIER_EMAIL_INVALID` | `email` sai định dạng, kể cả khi gửi `""` |
| 422 | 101205 `SUPPLIER_CODE_DOES_EXIST` | `code` đã được dùng |
| 422 | 101206 `SUPPLIER_CODE_RESERVED_BY_DELETED_SUPPLIER` | Một nhà cung cấp đã xoá mềm vẫn giữ `code` này |
| 422 | 101208 `SUPPLIER_TAX_CODE_DOES_EXIST` | `taxCode` trùng với một nhà cung cấp chưa xoá |

Lưu ý: khác với unit, material và material-type, lỗi validate của supplier đều trả **422**, kể cả các lỗi thiếu field.

## GET /api/v1/suppliers

- **Quyền:** `SUPPLIER_READ` (`supplier.controller.ts:60`).
- **Query** (`GetAllSupplierRequestDto`, `supplier.dto.ts:102-134`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| page, size | number | không | xem conventions.md | |
| code | string | không | — | So khớp chính xác, server chuyển sang IN HOA |
| taxCode | string | không | — | So khớp chính xác |
| search | string | không | — | Chứa chuỗi con, so khớp **một trong** `name`, `contactPerson`, `email` (OR), rồi AND với các bộ lọc khác (`supplier.service.ts:99-108`) |
| phonenumber | string | không | — | Chứa chuỗi con |
| startDate, endDate | string | không | xem conventions.md | Lọc theo `createdAt` |
| sortBy | `'createdAt' \| 'name' \| 'code'` | không | mặc định `createdAt` | |
| sort | `'ASC' \| 'DESC'` | không | mặc định `DESC` | |

- **Response 200:** trang phân trang của [SupplierResponseDto](#supplierresponsedto).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 101223 `SUPPLIER_DATE_RANGE_INVALID` | `startDate` sau `endDate` (`supplier.service.ts:88-90`) |

## GET /api/v1/suppliers/:slug

- **Quyền:** `SUPPLIER_READ` (`supplier.controller.ts:82`).
- **Response 200:** [SupplierResponseDto](#supplierresponsedto).
- **Lỗi riêng:** 404 `101201 SUPPLIER_NOT_FOUND`, khi không thấy slug hoặc bản ghi đã xoá mềm.

## PATCH /api/v1/suppliers/:slug

- **Quyền:** `SUPPLIER_UPDATE` (`supplier.controller.ts:102`).
- **Body:** `PartialType(CreateSupplierRequestDto)` (`supplier.dto.ts:93`). Mọi field đều không bắt buộc; field có gửi vẫn được validate như POST. Field không gửi, hoặc gửi `null`, được giữ nguyên (`supplier.service.ts:128-143`).
- **Response 200:** [SupplierResponseDto](#supplierresponsedto).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 101201 `SUPPLIER_NOT_FOUND` | Không thấy slug |
| 422 | 101202-101204, 101207, 101209, 101210 | Field có gửi nhưng sai |
| 422 | 101205 / 101206 | Đổi sang `code` đã bị dùng |
| 422 | 101208 `SUPPLIER_TAX_CODE_DOES_EXIST` | Đổi sang `taxCode` đã bị dùng |

## DELETE /api/v1/suppliers/:slug

- **Quyền:** `SUPPLIER_DELETE` (`supplier.controller.ts:122`).
- **Response 200:** `result` là chuỗi `"1 supplier have been deleted successfully"`. Đây là xoá mềm.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 101201 `SUPPLIER_NOT_FOUND` | Không thấy slug |
| 422 | 101211 `SUPPLIER_HAS_MATERIALS` | Còn ít nhất 1 vật tư chưa xoá đang gắn với nhà cung cấp (`supplier.service.ts:149-158`) |

## GET /api/v1/suppliers/:slug/materials

- **Quyền:** `SUPPLIER_READ` + `MATERIAL_READ` (`supplier.controller.ts:140`).
- **Query** (`GetSupplierMaterialRequestDto`, `supplier.dto.ts:170-201`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| page, size | number | không | xem conventions.md | |
| typeSlug | string | không | — | Lọc theo loại vật tư |
| code | string | không | — | Mã vật tư, so khớp **chính xác**, server chuyển sang IN HOA. Khác `GET /materials`, nơi `code` là so khớp tiền tố |
| name | string | không | — | Tên vật tư, chứa chuỗi con |
| from | string (ISO-8601) | không | `IsDateString` | Lọc `createdAt` của vật tư ≥ `from` |
| to | string (ISO-8601) | không | `IsDateString` | Lọc `createdAt` của vật tư ≤ `to` (gồm cả hai đầu, `Between`) |
| sort, startDate, endDate | — | không | Vẫn được validate | **Server không dùng.** Thứ tự luôn là `createdAt DESC` (`supplier.service.ts:162-190`). Bộ lọc ngày ở route này là `from`/`to`, **không phải** `startDate`/`endDate` |

- **Response 200:** trang phân trang của [SupplierMaterialResponseDto](#suppliermaterialresponsedto).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101221 `SUPPLIER_MATERIAL_DATE_INVALID` | `from` hoặc `to` không phải ISO-8601 |
| 404 | 101201 `SUPPLIER_NOT_FOUND` | Không thấy nhà cung cấp |

Route này không báo lỗi khi `from > to`; khi đó kết quả chỉ là danh sách rỗng.

## PUT /api/v1/suppliers/:slug/materials

- **Quyền:** `SUPPLIER_UPDATE` + `MATERIAL_UPDATE` (`supplier.controller.ts:160`).
- **Body** (`SupplierMaterialSlugsRequestDto`, `supplier.dto.ts:207-224`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| materialSlugs | string[] | có | Mảng có 1-100 phần tử (`supplier.constants.ts:19`); mỗi phần tử là chuỗi khác rỗng | Server trim và bỏ trùng lặp trước khi validate |

- **Hành vi** (`supplier.service.ts:197-215`): thao tác là tất cả hoặc không về mặt tồn tại. Chỉ một slug vật tư không tồn tại hoặc đã xoá mềm là cả lô bị từ chối. Vật tư đã gắn với nhà cung cấp này thì bỏ qua (idempotent). Vật tư đang thuộc nhà cung cấp khác **vẫn gắn được**, vì quan hệ là n-n.
- **Response 200:** `result` là `SupplierMaterialResponseDto[]` (mảng thường, **không phân trang**), gồm **mọi** vật tư trong lô, kể cả vật tư đã gắn từ trước. Thứ tự không được sắp xếp tường minh.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101222 `SUPPLIER_MATERIAL_SLUGS_INVALID` | Không phải mảng, mảng rỗng, quá 100 phần tử, hoặc có phần tử rỗng hay không phải chuỗi |
| 404 | 101201 `SUPPLIER_NOT_FOUND` | Không thấy nhà cung cấp |
| 404 | 100701 `MATERIAL_NOT_FOUND` | Có ít nhất 1 slug vật tư không tồn tại (mã của module material) |

## DELETE /api/v1/suppliers/:slug/materials

- **Quyền:** `SUPPLIER_UPDATE` + `MATERIAL_UPDATE` (`supplier.controller.ts:192`).
- **Body:** giống PUT (`materialSlugs`, 1-100 phần tử). Đây là DELETE **có body**.
- **Hành vi** (`supplier.service.ts:222-237`): thao tác là tất cả hoặc không. **Mọi** vật tư trong lô phải đang gắn với nhà cung cấp này; nếu không, cả lô bị từ chối. Chỉ cặp với nhà cung cấp này bị gỡ; vật tư vẫn giữ các nhà cung cấp khác. Nếu trong lúc xử lý có request khác gỡ chen vào, toàn bộ thao tác được rollback.
- **Response 200:** `result` là chuỗi `"<n> material have been detached successfully"`, với `n` là số vật tư khác nhau trong lô.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101222 `SUPPLIER_MATERIAL_SLUGS_INVALID` | Body sai |
| 404 | 101201 `SUPPLIER_NOT_FOUND` | Không thấy nhà cung cấp |
| 404 | 100701 `MATERIAL_NOT_FOUND` | Có slug vật tư không tồn tại |
| 422 | 101213 `SUPPLIER_MATERIAL_NOT_ATTACHED` | Có vật tư chưa gắn với nhà cung cấp này, hoặc bị gỡ chen giữa lúc xử lý |

## Mã lỗi của module

`src/supplier/supplier.validation.ts:60-132`. Không truyền HTTP status thì mặc định là 422 (`src/app/error-code.util.ts:15-21`).

| Key | code | HTTP | message |
|---|---|---|---|
| SUPPLIER_NOT_FOUND | 101201 | 404 | Supplier not found |
| SUPPLIER_NAME_IS_REQUIRED | 101202 | 422 | Supplier name is required |
| SUPPLIER_CODE_IS_REQUIRED | 101203 | 422 | Supplier code is required |
| SUPPLIER_CODE_INVALID | 101204 | 422 | Supplier code must be 2-32 letters, digits or hyphens, not starting/ending with a hyphen |
| SUPPLIER_CODE_DOES_EXIST | 101205 | 422 | Supplier code does exist |
| SUPPLIER_CODE_RESERVED_BY_DELETED_SUPPLIER | 101206 | 422 | Supplier code is still held by a deleted supplier |
| SUPPLIER_TAX_CODE_INVALID | 101207 | 422 | Supplier tax code is invalid |
| SUPPLIER_TAX_CODE_DOES_EXIST | 101208 | 422 | Supplier tax code does exist |
| SUPPLIER_PHONENUMBER_INVALID | 101209 | 422 | Supplier phone number is invalid |
| SUPPLIER_EMAIL_INVALID | 101210 | 422 | Supplier email is invalid |
| SUPPLIER_HAS_MATERIALS | 101211 | 422 | Supplier still has materials attached, detach them before deleting |
| SUPPLIER_MATERIAL_BELONGS_TO_OTHER_SUPPLIER | 101212 | 422 | Material is already attached to another supplier |
| SUPPLIER_MATERIAL_NOT_ATTACHED | 101213 | 422 | Material is not attached to this supplier |
| SUPPLIER_TRANSACTION_TYPE_INVALID | 101214 | 422 | Supplier transaction type is invalid |
| SUPPLIER_TRANSACTION_MATERIAL_IS_REQUIRED | 101215 | 422 | Material, quantity and unit price are required for PURCHASE/RETURN transactions |
| SUPPLIER_TRANSACTION_QUANTITY_INVALID | 101216 | 422 | Quantity must be a positive number with at most 6 decimal places |
| SUPPLIER_TRANSACTION_UNIT_PRICE_INVALID | 101217 | 422 | Unit price must be a non-negative number with at most 2 decimal places |
| SUPPLIER_TRANSACTION_AMOUNT_INVALID | 101218 | 422 | Amount must be a positive number with at most 2 decimal places |
| SUPPLIER_TRANSACTION_DATE_INVALID | 101219 | 422 | Transaction date must be an ISO 8601 date |
| SUPPLIER_TRANSACTION_PAYMENT_HAS_MATERIAL | 101220 | 422 | PAYMENT transactions must not carry material, quantity or unit price |
| SUPPLIER_MATERIAL_DATE_INVALID | 101221 | 422 | Material date filter (from/to) must be an ISO 8601 date |
| SUPPLIER_MATERIAL_SLUGS_INVALID | 101222 | 422 | materialSlugs must be a non-empty array of at most 100 material slugs |
| SUPPLIER_DATE_RANGE_INVALID | 101223 | 400 | startDate must not be after endDate |

Hiện các route không trả ra các mã sau:

- `101212`: comment trong code ghi rõ mã này không còn được ném từ khi quan hệ đổi sang n-n.
- `101214`-`101220`: chỉ thuộc route giao dịch, mà route này đang ẩn.

## Ghi chú cho FE

- **Status lỗi validate là 422**, khác các module unit, material và material-type (dùng 400 cho lỗi thiếu field hoặc sai định dạng). Riêng `SUPPLIER_DATE_RANGE_INVALID` là 400.
- **Xoá trắng field tuỳ chọn khi PATCH:**
  - `address`, `contactPerson`, `note`: gửi `""` sẽ lưu chuỗi rỗng.
  - `taxCode`, `phonenumber`, `email`: gửi `""` bị chặn bởi regex hoặc `IsEmail` (422). Gửi `null` thì giữ nguyên giá trị cũ.

  Vì vậy hiện **không có cách xoá** `taxCode`, `phonenumber` hay `email` qua API (theo code `supplier.dto.ts:49-68` và `pickDefined`).
- **Unique:** `code` tính cả bản ghi đã xoá mềm (`RESERVED_BY_DELETED`). `taxCode` chỉ tính bản ghi chưa xoá, và DB không có UNIQUE index trên cột này (`src/migrations/1783728000031-create-supplier-tables.ts:36`).
- **Không có optimistic lock:** entity kế thừa `Base`, không có `version`.
- **Hai cách gắn vật tư:** từ phía nhà cung cấp (`PUT|DELETE /suppliers/:slug/materials`, gắn hoặc gỡ từng phần) và từ phía vật tư (`PUT /materials/:slug/suppliers`, thay toàn bộ, xem [material.md](material.md#put-apiv1materialsslugsuppliers)).
- **DELETE có body:** một số HTTP client hoặc proxy không gửi body cho DELETE. FE cần đảm bảo body thật sự được gửi đi.
- **Giao dịch nhà cung cấp** chưa có route. Đừng gọi `/suppliers/:slug/transactions`; route này sẽ trả 404 của framework.

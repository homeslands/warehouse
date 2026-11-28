# Phiếu nhập kho (Import Form)

> Nguồn: `src/import-form/import-form.controller.ts`, `import-form.dto.ts`, `import-form.validation.ts`,
> `import-form.service.ts`, `import-form.mapper.ts`, `import-form.constants.ts`, `import-form.entity.ts`,
> `import-form-item.entity.ts` (đường dẫn tính từ `app/warehouse-api`). Đối chiếu tại commit `5555273`.
> Base URL: `/api/v1`. Envelope, lỗi chung, auth, guard, phân trang: xem [conventions.md](conventions.md).

Mọi route nằm dưới `/api/v1/warehouses/:warehouseSlug/import-forms` và có `@WarehouseScope('warehouseSlug')`
ở mức class (`controller.ts:51-54`). User phải là manager/member của kho; `SUPER_ADMIN`/`ADMIN` được bỏ qua
bước kiểm tra kho. Khi thao tác trên một phiếu, service luôn tìm phiếu theo cả `slug` phiếu và `warehouse.slug`
(`service.ts:425-434`). Vì vậy, gắn slug phiếu của kho B vào URL kho A sẽ nhận `IMPORT_FORM_NOT_FOUND`.

## Tóm tắt endpoint

| Method | Path | Quyền (authority / role) | Mô tả |
|---|---|---|---|
| POST | /api/v1/warehouses/:warehouseSlug/import-forms | `IMPORT_FORM_CREATE` | Tạo phiếu `DRAFT` **rỗng** (chưa có dòng) |
| POST | /api/v1/warehouses/:warehouseSlug/import-forms/upload-file | Một trong `IMPORT_FORM_CREATE` / `IMPORT_FORM_UPDATE_DRAFT` / `IMPORT_FORM_UPDATE_DRAFT_OWN` (service kiểm tra) | Upload file đính kèm lên S3 và nhận link |
| GET | /api/v1/warehouses/:warehouseSlug/import-forms | `IMPORT_FORM_READ` | Danh sách phiếu có phân trang (không kèm `items`) |
| GET | /api/v1/warehouses/:warehouseSlug/import-forms/available-materials | `IMPORT_FORM_CREATE` | Vật tư được phép ghi vào phiếu nhập của kho, kèm đơn vị và NCC |
| GET | /api/v1/warehouses/:warehouseSlug/import-forms/:slug | `IMPORT_FORM_READ` | Chi tiết phiếu kèm `items` |
| PATCH | /api/v1/warehouses/:warehouseSlug/import-forms/:slug | `IMPORT_FORM_UPDATE_DRAFT`, hoặc `IMPORT_FORM_UPDATE_DRAFT_OWN` với phiếu mình lập (service kiểm tra) | Sửa một phần **đầu phiếu** `DRAFT` (không sửa dòng) |
| POST | /api/v1/warehouses/:warehouseSlug/import-forms/:slug/items | Như PATCH (service kiểm tra) | Quét barcode / chọn vật tư: thêm `quantity` dòng, mỗi dòng 1 đơn vị hàng với 1 mã riêng |
| DELETE | /api/v1/warehouses/:warehouseSlug/import-forms/:slug/items/:itemSlug | Như PATCH (service kiểm tra) | Gỡ 1 dòng (1 đơn vị hàng) khỏi phiếu `DRAFT` |
| POST | /api/v1/warehouses/:warehouseSlug/import-forms/:slug/confirm | `IMPORT_FORM_CONFIRM` | `DRAFT → CONFIRMED`: cộng tồn và sinh lô |
| POST | /api/v1/warehouses/:warehouseSlug/import-forms/:slug/cancel | `IMPORT_FORM_CONFIRM` | `DRAFT → CANCELLED` |
| DELETE | /api/v1/warehouses/:warehouseSlug/import-forms/:slug | `IMPORT_FORM_DELETE_DRAFT`, hoặc `IMPORT_FORM_DELETE_DRAFT_OWN` với phiếu mình lập (service kiểm tra) | Xoá mềm phiếu `DRAFT` |

Tổng: **11 endpoint**.

**Luồng nhập (từ WR-5):** `POST /import-forms` (phiếu nháp rỗng) → mỗi lần quét/nhập tay gọi
`POST /:slug/items` (server sinh mã đơn vị hàng `CodeType.Item`, ví dụ `IT-WH-001-261126-000001`, 1 mã / 1 đơn vị) →
`POST /:slug/confirm` (cộng tồn, mỗi dòng thành 1 lô mang đúng mã của dòng).

Quyền mặc định lúc seed (`src/migrations/1783728000012-seed-warehouse-form-authorities.ts:49-98`) chỉ để
tham khảo. Lúc chạy, nguồn chuẩn là `permission_tbl`, admin có thể bật/tắt quyền.

| Authority | Role được cấp lúc seed |
|---|---|
| `IMPORT_FORM_CREATE` | ADMIN, SUPERVISOR |
| `IMPORT_FORM_READ` | ADMIN, MANAGER, SUPERVISOR |
| `IMPORT_FORM_UPDATE_DRAFT` | ADMIN |
| `IMPORT_FORM_UPDATE_DRAFT_OWN` | SUPERVISOR |
| `IMPORT_FORM_DELETE_DRAFT` | ADMIN, MANAGER |
| `IMPORT_FORM_DELETE_DRAFT_OWN` | SUPERVISOR |
| `IMPORT_FORM_CONFIRM` | ADMIN, MANAGER |
| `IMPORT_FORM_EXPORT` | ADMIN, MANAGER, SUPERVISOR (chưa có route nào dùng quyền này) |

`SUPER_ADMIN` bypass mọi kiểm tra authority, kể cả các kiểm tra trong service (`src/authority/authority-check.util.ts:17,36`).

## Vòng đời trạng thái

`ImportFormStatus` (`constants.ts:10-14`): `DRAFT` | `CONFIRMED` | `CANCELLED`.

```
DRAFT --confirm--> CONFIRMED   (cộng tồn kho + sinh lô)
  |
  +----cancel----> CANCELLED   (không đụng tồn)
```

| Từ | Sang | Endpoint | Ai làm | Tác động |
|---|---|---|---|---|
| (mới) | `DRAFT` | `POST /import-forms` | Có `IMPORT_FORM_CREATE`. User được ghi vào `requester` và `requesterName` | Không đụng tồn, `total = 0`, chưa có dòng |
| `DRAFT` | `DRAFT` | `PATCH /:slug`, `POST /:slug/items`, `DELETE /:slug/items/:itemSlug` | `UPDATE_DRAFT` (mọi phiếu) hoặc `UPDATE_DRAFT_OWN` (chỉ phiếu mình lập) | Không đụng tồn. Thêm hàng tạo item `PENDING` (`GET .../items` thấy ngay), gỡ dòng xoá hẳn item. Thêm/gỡ dòng luôn tăng `version`. PATCH đổi `date` thì `entryDate` của item đổi theo |
| `DRAFT` | (xoá mềm) | `DELETE /:slug` | `DELETE_DRAFT` hoặc `DELETE_DRAFT_OWN` (phiếu mình lập) | Không đụng tồn. Item `PENDING` của phiếu bị xoá hẳn |
| `DRAFT` | `CONFIRMED` | `POST /:slug/confirm` | Có `IMPORT_FORM_CONFIRM`. Người này được ghi vào `approver` và `approverName` | Phiếu phải có ít nhất 1 dòng (101317). Cộng `baseQuantity` của từng dòng vào tồn kho (`InventoryService.receive`, lịch sử `IMPORT`). Item `PENDING` của phiếu chuyển `IN_STOCK`, `entryDate` = `date` của phiếu. Tất cả chạy trong 1 transaction (`service.ts:379-416`) |
| `DRAFT` | `CANCELLED` | `POST /:slug/cancel` | Có `IMPORT_FORM_CONFIRM` (không kiểm người lập). Người này được ghi vào `approver` | Không đụng tồn. Item `PENDING` của phiếu chuyển `VOID` |

- Chỉ phiếu `DRAFT` mới sửa, xoá, xác nhận hoặc huỷ được. Phiếu ở trạng thái khác trả `IMPORT_FORM_NOT_DRAFT` (409)
  (`service.ts:602-605`). Phiếu `CONFIRMED`/`CANCELLED` là bất biến, không có authority nào mở được.
- Phiếu nhập **không có** bước `PENDING` và không giữ chỗ (reserve). Phiếu xuất mới có các bước này.
- Confirm và cancel khoá đầu phiếu bằng `pessimistic_write`, rồi kiểm tra lại trạng thái và `version` trên bản
  đã khoá (`service.ts:383-390`). Vì vậy 2 request confirm đồng thời không cộng tồn 2 lần: request thứ hai nhận 409.

---

## POST /api/v1/warehouses/:warehouseSlug/import-forms

- **Quyền:** `IMPORT_FORM_CREATE` (`controller.ts:59`) + warehouse scope.
- **Path params:**

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| warehouseSlug | string (slug) | có | | Kho phải tồn tại và `isActive` (`service.ts:138-140`) |

- **Body** (`CreateImportFormRequestDto`; `whitelist: true` bỏ các field lạ, ví dụ `code`, `items`, `status`, `total`, `requester`, `warehouse`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| purchaseOrder | string | không | ≤ 64 ký tự | Số PO |
| invoiceCode | string | có | Không rỗng, ≤ 64 ký tự | Số hoá đơn |
| date | string (`YYYY-MM-DD`) | có | ISO 8601 strict + regex `^\d{4}-\d{2}-\d{2}$` | Ngày nhập, không có múi giờ |
| file | string | không | ≤ 1024 ký tự | Link nhận từ `POST .../upload-file`. Server chỉ lưu nguyên chuỗi, không kiểm tra |
| note | string | không | Không có validator kiểu (xem Ghi chú cho FE) | |

`code` của phiếu do server sinh (`CodeType.ImportForm`). Phiếu tạo ra **chưa có dòng**, `total = 0`; hàng thêm qua
`POST /:slug/items`.

- **Response 201:** `result` = `ImportFormResponseDto` với `items: []`, `groups: []`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101306, 101307, 101308, 101310, 101312 | Sai `purchaseOrder` / thiếu `invoiceCode` / sai `invoiceCode` / sai `date` / sai `file` |
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 422 | 101316 | Kho đang tắt (`isActive = false`) |
| 404 | 100405 `USER_NOT_FOUND` | User trong JWT không còn tồn tại |

## POST /api/v1/warehouses/:warehouseSlug/import-forms/upload-file

- **Quyền:** Route không gắn `@RequireAuthority`. Service yêu cầu có ít nhất một trong `IMPORT_FORM_CREATE`,
  `IMPORT_FORM_UPDATE_DRAFT`, `IMPORT_FORM_UPDATE_DRAFT_OWN`, nếu không trả 403 (`service.ts:118-122`). Vẫn áp dụng warehouse scope.
- **Body:** `multipart/form-data`, đúng 1 field `file` (`controller.ts:89-101`).

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| file | binary | có | ≤ 10MB (`IMPORT_FORM_UPLOAD_MAX_SIZE`). Đuôi file và mimetype phải khớp một cặp: pdf/`application/pdf`, jpg và jpeg/`image/jpeg`, png/`image/png`, webp/`image/webp`, xlsx, xls, docx, doc (`src/file/file.constant.ts:37-49`, `src/file/file.util.ts:18-28`) | Mimetype là giá trị client khai. Server không đọc nội dung file |

- **Response 201:** `result` là `string`: URL S3 dạng `https://<bucket>.s3.<region>.amazonaws.com/import-forms/<key>`
  (`src/file/s3/s3.service.ts:76-79`). Gửi URL này vào field `file` khi `POST`/`PATCH` phiếu. Upload không gắn file vào phiếu nào.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 403 | — | Không có quyền nào trong 3 quyền trên (`ForbiddenException` không có `code`) |
| 422 | 121000 `FILE_NOT_FOUND` | Không gửi field `file` |
| 422 | 101329 | Đuôi file và mimetype không khớp allowlist |
| 422 | 121001 `FILE_SIZE_EXCEEDS_LIMIT_ALLOWED` | File > 10MB (multer, `src/file/custom-interceptor.ts:25-26`) |
| 422 | 121002 / 121003 / 121008 / 121009 | Các lỗi khác của multer: quá số file / sai tên field / lỗi multer / lỗi upload (`custom-interceptor.ts:27-45`) |

## GET /api/v1/warehouses/:warehouseSlug/import-forms

- **Quyền:** `IMPORT_FORM_READ` + warehouse scope.
- **Query** (`GetAllImportFormRequestDto`, `dto.ts:200-257`, kế thừa `BaseQueryDto`: `page`, `size` ≤ 500, `sort`, `startDate`, `endDate`; xem conventions.md):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| status | `'DRAFT' \| 'CONFIRMED' \| 'CANCELLED'` | không | enum | Khớp chính xác |
| code | string | không | Được trim và chuyển IN HOA, sau đó phải khớp `^[A-Z0-9_-]+$` | Khớp tiền tố (`LIKE 'x%'`) |
| invoiceCode | string | không | ≤ 64 ký tự | Khớp tiền tố. Không chuyển hoa/thường (so sánh có phân biệt hoa/thường hay không phụ thuộc collation của DB, chưa xác minh) |
| purchaseOrder | string | không | ≤ 64 ký tự | Khớp tiền tố |
| requesterSlug | string | không | | Khớp chính xác slug người lập |
| approverSlug | string | không | | Khớp chính xác slug người xác nhận/huỷ |
| sortBy | `'createdAt' \| 'code'` | không | enum, mặc định `createdAt` | |
| startDate / endDate | string | không | | Lọc theo **`createdAt`** (ngày tạo bản ghi), không phải field `date` của phiếu |

- **Response 200:** `result` = `AppPaginatedResponseDto<ImportFormResponseDto>`. Các phần tử **không có field `items`**
  (list không load relation này, `mapper.ts:94-102`, `service.ts:197-203`).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101313 | `status` sai enum |
| 400 | 101332 | `code` chứa ký tự ngoài `A-Z 0-9 _ -` |
| 422 | 101308 / 101306 | `invoiceCode` / `purchaseOrder` dài hơn 64 ký tự |
| 400 | 101331 | `startDate` sau `endDate` (`service.ts:182-184`) |
| 404 | 100501 | Không có kho (`service.ts:180`) |

## GET /api/v1/warehouses/:warehouseSlug/import-forms/available-materials

- **Quyền:** `IMPORT_FORM_CREATE` + warehouse scope (`controller.ts:149-150`).
- **Query** (`GetImportFormAvailableMaterialRequestDto`, `dto.ts:259-274` + `BaseQueryDto`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| code | string | không | Chuyển IN HOA, khớp `^[A-Z0-9_-]+$` | Khớp tiền tố theo mã vật tư |
| name | string | không | | Khớp một phần tên vật tư (`LIKE '%x%'`) |
| page / size | number | không | Theo `BaseQueryDto` | |

  `sort`, `startDate`, `endDate` qua được validate nhưng **bị bỏ qua**. Kết quả luôn sắp theo `material.code ASC` (`service.ts:226-232`).
- **Response 200:** `result` = `AppPaginatedResponseDto<ImportFormAvailableMaterialResponseDto>` (`dto.ts:276-332`, `service.ts:234-256`).
  Chỉ gồm vật tư đã gán vào kho (có dòng tồn kho).

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug, code, name | string | Của vật tư |
| baseUnitSlug | string \| null | `null` với vật tư cũ chưa có đơn vị cơ sở |
| quantity | number | Tồn hiện tại trong kho, theo đơn vị cơ sở |
| effectiveMaximumInventory | number (optional) | Ngưỡng tồn tối đa hiệu lực của kho (ưu tiên override của kho, ngược lại lấy mặc định của vật tư), theo đơn vị cơ sở. Không có mặt khi ngưỡng hiệu lực bằng `0` (không giới hạn, kể cả trường hợp kho đặt override `0`) |
| suppliers[] | `{ slug, code, name }` | NCC của vật tư, sắp theo `code`. Là danh sách gợi ý cho `items[].supplierSlug` |
| units[] | `{ unitSlug, unitCode, unitName, conversionRate: number, isBaseUnit: boolean }` | Sắp theo `conversionRate` tăng dần |

- **Lỗi riêng:** 400 101332 (`code` sai ký tự), 404 100501 (không có kho).

## GET /api/v1/warehouses/:warehouseSlug/import-forms/:slug

- **Quyền:** `IMPORT_FORM_READ` + warehouse scope.
- **Path params:** `warehouseSlug`, `slug` (slug của phiếu).
- **Response 200:** `ImportFormResponseDto` kèm `items`, sắp theo `lineNo ASC` (`service.ts:425-434`).
- **Lỗi riêng:** 404 101301 khi phiếu không tồn tại, đã xoá mềm, hoặc thuộc kho khác. Route này không gọi `findWarehouse`,
  nên kho không tồn tại cũng trả 101301.

## PATCH /api/v1/warehouses/:warehouseSlug/import-forms/:slug

- **Quyền:** Route không gắn `@RequireAuthority`. Service kiểm tra (`service.ts:615-628`, `src/authority/authority-check.util.ts:29-41`):
  - có `IMPORT_FORM_UPDATE_DRAFT`: được sửa mọi phiếu nháp trong kho;
  - chỉ có `IMPORT_FORM_UPDATE_DRAFT_OWN`: chỉ được sửa phiếu có `requester` là mình, phiếu khác trả 403 với code `101315`;
  - không có cả hai: 403 không có `code`.
- **Body** (`UpdateImportFormRequestDto`): mọi field của body POST đều **tuỳ chọn** (`PartialType`)
  với cùng ràng buộc như POST, cộng thêm:

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| version | number (int ≥ 1) | **có** | | Lấy từ lần GET gần nhất. Dùng cho optimistic lock |

  Ngữ nghĩa partial (`service.ts:279-295`, `src/shared/utils/obj.util.ts:13-17`):
  - Field vắng mặt hoặc `null`: giữ nguyên giá trị cũ. Gửi `null` **không xoá** được `purchaseOrder`/`file`/`note`.
  - **Không sửa dòng qua PATCH** — `items` gửi lên bị `whitelist` bỏ. Dùng `POST`/`DELETE .../items`.
  - Đổi `date`: server kiểm tra lại `expiryDate` của các dòng đã có so với `date` mới.
  - Ghi trên bản đầu phiếu đã khoá (`pessimistic_write`) và so lại `version` trên bản đó: thêm/gỡ dòng chen giữa
    (luôn tăng `version`) ⇒ 409 `100800`, không ghi đè `total` mới.
- **Response 200:** `ImportFormResponseDto` kèm `items`, `groups`.
- **Lỗi riêng** (thứ tự: tìm phiếu và kiểm tra version → `DRAFT` → quyền → hạn dùng → khoá + version):

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101334 | Thiếu `version`, không phải số nguyên, hoặc < 1 |
| 404 | 101301 | Không có phiếu |
| 409 | 100800 `DATA_VERSION_CONFLICT` | `version` khác version hiện tại trong DB (`src/app/optimistic-lock.filter.ts`) |
| 409 | 101314 | Phiếu không còn `DRAFT` |
| 403 | — / 101315 | Không có quyền / chỉ có quyền `_OWN` nhưng không phải người lập |
| 422 | 101333 | `date` mới sau `expiryDate` của một dòng đã có |
| … | | Các lỗi validate đầu phiếu giống POST |

## POST /api/v1/warehouses/:warehouseSlug/import-forms/:slug/items

Thêm hàng vào phiếu nháp — 1 lần quét barcode, hoặc nhập tay vật tư + số lượng.

- **Quyền:** như PATCH — `IMPORT_FORM_UPDATE_DRAFT`, hoặc `IMPORT_FORM_UPDATE_DRAFT_OWN` với phiếu mình lập (service kiểm tra).
- **Body** (`AddImportFormItemRequestDto`), **không có `version`** — các lần quét liên tiếp không cần mang version mới nhất:

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| barcode | string | 1 trong 2 | 8–14 chữ số | Quét: tra `material.barcode`. Không thấy ⇒ 404 101325 (**không** tự tạo vật tư) |
| materialSlug | string (slug) | 1 trong 2 | Không rỗng | Nhập tay. Gửi cả 2 hoặc không gửi cái nào ⇒ 101319 |
| unitSlug | string (slug) | không | Không rỗng | Đơn vị gắn với vật tư. Không gửi ⇒ đơn vị cơ sở (vật tư cũ chưa có đơn vị cơ sở ⇒ 101320) |
| quantity | integer | không (mặc định 1) | 1–500 | Số đơn vị. **N đơn vị ⇒ N dòng, N mã.** |
| unitPrice | number | có | ≥ 0, tối đa 2 chữ số thập phân | Đơn giá 1 đơn vị `unitSlug` |
| note | string | không | | Chép vào mọi dòng được thêm |
| supplierSlug | string (slug) | không | | Như trước: có gửi thì dùng NCC đó (chưa gắn ⇒ server tự gắn, cùng transaction; không tồn tại ⇒ 101201); không gửi ⇒ NCC duy nhất của vật tư, hoặc `null` |
| expiryDate | string (`YYYY-MM-DD`) | không | Không trước `date` của phiếu | Chép sang lô khi confirm |

Mỗi dòng: `quantity = 1`, `conversionRate` chụp lúc ghi, `baseQuantity = conversionRate`, `amount = unitPrice`,
`lineNo` nối tiếp dòng lớn nhất hiện có, `code` = mã `CodeType.Item` `{prefix}-{mã kho}-{yymmdd}-{seq:6}` (tiền tố mặc định
`IT`, bộ đếm theo kho + ngày giờ Việt Nam, dùng chung bộ đếm `ITEM` với mã vật tư tự sinh). Mã duy nhất toàn hệ thống, không
bao giờ cấp lại (kể cả khi dòng bị gỡ hoặc phiếu bị huỷ/xoá).

Transaction: khoá đầu phiếu (`FOR UPDATE`) → kiểm lại `DRAFT` → trần 1000 dòng/phiếu → `total` mới → gắn NCC →
sinh N mã → ghi N dòng → ghi `total` và **tăng `version`** (kể cả khi `unitPrice = 0`). Người đang giữ `version` cũ
(PATCH/confirm/cancel) sẽ nhận 409 `100800` — không xác nhận nhầm phiếu đã có thêm hàng sau lần đọc.

- **Response 201:** `result` = `{ codes: string[], form: ImportFormResponseDto }` — `codes` là các mã vừa sinh (theo thứ tự
  `lineNo`), `form` là phiếu sau khi thêm (kèm `items` và `groups`).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101319 | Gửi cả `barcode` lẫn `materialSlug`, hoặc không gửi cái nào |
| 422 | 101335 | `barcode` không phải 8–14 chữ số |
| 422 | 101320, 101321, 101322, 101323, 101330, 101333 | Field không hợp lệ (xem bảng mã lỗi) |
| 404 | 101301 | Không có phiếu |
| 409 | 101314 | Phiếu không còn `DRAFT` (kiểm tra cả trước và sau khi khoá) |
| 403 | — / 101315 | Không có quyền / chỉ có `_OWN` nhưng không phải người lập |
| 404 | 101325 | Không có vật tư với `barcode` / `materialSlug` đó |
| 422 | 101328 | Vật tư chưa được gán vào kho của phiếu |
| 422 | 101326 / 101327 | Đơn vị không gắn với vật tư / tỉ lệ quy đổi trong DB không hợp lệ |
| 404 | 101201 | `supplierSlug` không tồn tại |
| 422 | 101318 | Phiếu sẽ vượt 1000 dòng |
| 422 | 101311 | `total` mới ≥ 1e16 |

## DELETE /api/v1/warehouses/:warehouseSlug/import-forms/:slug/items/:itemSlug

- **Quyền:** như PATCH.
- **Body:** không có, không cần `version`.
- **Tác động:** trong transaction khoá đầu phiếu, xoá cứng dòng `itemSlug` của phiếu, trừ `amount` khỏi `total`, tăng `version`.
  Mã của dòng **không** được cấp lại. `lineNo` các dòng còn lại không đánh lại.
- **Response 200:** `ImportFormResponseDto` kèm `items`, `groups`.
- **Lỗi riêng:** 404 101301, 409 101314, 403 — / 101315, 404 101336 (dòng không thuộc phiếu hoặc đã bị gỡ).

## POST /api/v1/warehouses/:warehouseSlug/import-forms/:slug/confirm

- **Quyền:** `IMPORT_FORM_CONFIRM` + warehouse scope. Không kiểm tra người lập: người lập phiếu vẫn tự xác nhận được nếu có quyền này.
- **Body** (`ChangeImportFormStatusRequestDto`, `dto.ts:183-192`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| version | number (int ≥ 1) | có | | Version hiện tại của phiếu |

- **Response 200:** `ImportFormResponseDto` với `status = 'CONFIRMED'`, có `approverSlug`/`approverName` và `items`.
- **Tác động:** Cộng tồn (gộp theo vật tư, lịch sử `IMPORT`, note `Import form <code>`). Item `PENDING` của phiếu
  chuyển `IN_STOCK`, `entryDate = date` (`ItemService.receiveImportForm`). Tất cả nằm trong cùng 1 transaction.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101334 | `version` không hợp lệ |
| 422 | 101317 | Phiếu chưa có dòng nào |
| 404 | 101301 | Không có phiếu (kể cả khi phiếu biến mất lúc lấy khoá) |
| 409 | 100800 | Sai `version`, kể cả khi kiểm tra lại trên bản đã khoá |
| 409 | 101314 | Phiếu không còn `DRAFT` (kiểm tra cả trước và sau khi khoá) |
| 404 | 101325 | Vật tư của một dòng đã bị xoá mềm sau khi ghi dòng (`service.ts:403-406`) |
| 404 | 100801 `INVENTORY_NOT_FOUND` | Vật tư đã bị gỡ khỏi kho sau khi lập phiếu (`src/inventory/inventory.service.ts:351-372`) |
| 404 | 100405 | User trong JWT không còn tồn tại |

## POST /api/v1/warehouses/:warehouseSlug/import-forms/:slug/cancel

- **Quyền:** `IMPORT_FORM_CONFIRM` + warehouse scope.
- **Body:** `{ version: number }`, giống confirm.
- **Response 200:** `ImportFormResponseDto` với `status = 'CANCELLED'`, có `approverSlug`/`approverName` (là người huỷ). Không đụng tồn.
- **Lỗi riêng:** 422 101334, 404 101301, 409 100800, 409 101314, 404 100405.

## DELETE /api/v1/warehouses/:warehouseSlug/import-forms/:slug

- **Quyền:** Route không gắn `@RequireAuthority`. Service yêu cầu `IMPORT_FORM_DELETE_DRAFT`, hoặc `IMPORT_FORM_DELETE_DRAFT_OWN`
  với phiếu mình lập (`service.ts:330-335`).
- **Body:** không có, **không cần `version`**.
- **Response 200:** `result` là chuỗi `"1 import form have been deleted successfully"` (`controller.ts:305`).
  Đây là xoá mềm: phiếu và các dòng bị soft-remove (`import-form.entity.ts:86-89`). Mã `code` của phiếu vẫn bị giữ (xem 101305).
- **Lỗi riêng:** 404 101301, 409 101314 (không còn `DRAFT`), 403 không có `code` / 403 101315.

---

## Dạng response

`ImportFormResponseDto` (`dto.ts:412-467`, `mapper.ts:77-104`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug | string | |
| createdAt, updatedAt | string (ISO-8601) | |
| version | number | Gửi lại field này khi PATCH/confirm/cancel |
| code | string | IN HOA |
| purchaseOrder | string \| null | |
| invoiceCode | string | |
| requesterSlug | string \| null | `null` khi không load được user (ví dụ user đã xoá mềm) |
| requesterName | string | Tên người lập, chụp lúc tạo phiếu |
| approverSlug | string \| null | `null` khi phiếu còn `DRAFT` |
| approverName | string \| null | Tên người xác nhận/huỷ, chụp lúc thao tác |
| date | string (`YYYY-MM-DD`) | |
| total | number | Σ `items.amount`, DECIMAL(18,2) |
| file | string \| null | |
| note | string \| null | |
| status | `'DRAFT' \| 'CONFIRMED' \| 'CANCELLED'` | |
| warehouseSlug | string | |
| items | `ImportFormItemResponseDto[]` | **Chỉ có ở POST, GET chi tiết, PATCH, thêm/gỡ dòng, confirm, cancel.** Không có trong list. 1 dòng = 1 đơn vị hàng = 1 item (`slug` của dòng chính là slug item ở `GET .../items/:slug`) |
| groups | `ImportFormItemGroupResponseDto[]` | Có cùng lúc với `items`: `items` gộp theo (vật tư, đơn vị, đơn giá), theo thứ tự xuất hiện đầu tiên |

`ImportFormItemGroupResponseDto`: `materialSlug`, `materialCode`, `materialName`, `unitSlug`, `unitCode`, `unitName`, `unitPrice`,
`quantity` (Σ, = số đơn vị), `baseQuantity` (Σ), `amount` (Σ), `codes` (mã các dòng, bỏ qua `null`).

`ImportFormItemResponseDto` (`dto.ts:334-410`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug, createdAt, updatedAt | string | |
| lineNo | number | 1-based, theo thứ tự thêm vào phiếu (có thể có khoảng trống sau khi gỡ dòng) |
| code | string \| null | Mã đơn vị hàng, ví dụ `IT-WH-001-261126-000001`. `null` ở dòng ghi trước WR-5 |
| materialSlug | string | |
| materialCode, materialName | string | Chụp lúc ghi dòng |
| unitSlug | string | |
| unitCode, unitName | string | Chụp lúc ghi dòng |
| supplierSlug, supplierCode, supplierName, supplierTaxCode, supplierAddress | string \| null | NCC chụp lúc ghi dòng, không có FK. Vật tư đổi NCC sau đó không làm thay đổi dòng này |
| quantity | number | Theo đơn vị của dòng. Dòng mới luôn = 1; dòng cũ (trước WR-5) có thể là số lẻ |
| conversionRate | number | Chụp lúc ghi dòng |
| baseQuantity | number | `quantity × conversionRate`, theo đơn vị cơ sở. Đây là lượng cộng vào tồn |
| unitPrice | number | 2 chữ số thập phân |
| amount | number | `quantity × unitPrice`, làm tròn 2 chữ số |
| note | string \| null | |
| expiryDate | string (`YYYY-MM-DD`) \| null | |
| status | `ItemStatus` | `PENDING` khi phiếu còn nháp, `IN_STOCK` (hoặc trạng thái sau đó do phiếu xuất) khi đã xác nhận, `VOID` khi đã huỷ |

Ví dụ rút gọn (`GET /:slug`):

```json
{
  "slug": "x7fk2p9qab", "version": 3, "code": "PN-2026-0001", "status": "DRAFT",
  "invoiceCode": "HD-0001234", "purchaseOrder": null, "date": "2026-10-12", "total": 1575000,
  "requesterSlug": "u1", "requesterName": "Nguyễn Văn A", "approverSlug": null, "approverName": null,
  "warehouseSlug": "kho-a", "file": null, "note": null,
  "items": [{ "lineNo": 1, "code": "IT-WH-001-261012-000001", "materialSlug": "m1", "unitSlug": "u-bao",
              "quantity": 1, "conversionRate": 50, "baseQuantity": 50, "unitPrice": 787500, "amount": 787500,
              "supplierSlug": null, "expiryDate": "2027-10-12" },
            { "lineNo": 2, "code": "IT-WH-001-261012-000002", "...": "..." }],
  "groups": [{ "materialSlug": "m1", "unitSlug": "u-bao", "unitPrice": 787500, "quantity": 2,
               "baseQuantity": 100, "amount": 1575000,
               "codes": ["IT-WH-001-261012-000001", "IT-WH-001-261012-000002"] }]
}
```

## Mã lỗi của module

Nguồn: `src/import-form/import-form.validation.ts:82-202`. HTTP mặc định là 422 (`src/app/error-code.util.ts:15-21`).

| Key | code | HTTP | message |
|---|---|---|---|
| IMPORT_FORM_NOT_FOUND | 101301 | 404 | Import form not found |
| IMPORT_FORM_CODE_IS_REQUIRED | 101302 | 422 | Import form code is required |
| IMPORT_FORM_CODE_INVALID | 101303 | 422 | Import form code must be 2-32 letters, digits or hyphens |
| IMPORT_FORM_CODE_DOES_EXIST | 101304 | 422 | Import form code does exist |
| IMPORT_FORM_CODE_RESERVED_BY_DELETED_IMPORT_FORM | 101305 | 422 | Import form code is still held by a deleted import form |
| IMPORT_FORM_PURCHASE_ORDER_INVALID | 101306 | 422 | Purchase order must be at most 64 characters |
| IMPORT_FORM_INVOICE_CODE_IS_REQUIRED | 101307 | 422 | Invoice code is required |
| IMPORT_FORM_INVOICE_CODE_INVALID | 101308 | 422 | Invoice code must be at most 64 characters |
| IMPORT_FORM_DATE_INVALID | 101310 | 422 | Date must be a valid date in YYYY-MM-DD format |
| IMPORT_FORM_TOTAL_INVALID | 101311 | 422 | Total or item amount exceeds the maximum supported value |
| IMPORT_FORM_FILE_INVALID | 101312 | 422 | File must be a string of at most 1024 characters |
| IMPORT_FORM_STATUS_INVALID | 101313 | 422 | Status must be one of DRAFT, CONFIRMED, CANCELLED |
| IMPORT_FORM_NOT_DRAFT | 101314 | 409 | Only a DRAFT import form can be changed |
| IMPORT_FORM_NOT_OWNER | 101315 | 403 | You can only change import forms you requested |
| IMPORT_FORM_WAREHOUSE_INACTIVE | 101316 | 422 | Cannot create an import form for an inactive warehouse |
| IMPORT_FORM_ITEMS_IS_REQUIRED | 101317 | 422 | Import form must have at least 1 item |
| IMPORT_FORM_ITEMS_TOO_MANY | 101318 | 422 | Import form can have at most 1000 items |
| IMPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED | 101319 | 422 | Exactly one of barcode or materialSlug is required |
| IMPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED | 101320 | 422 | Item unit slug is required |
| IMPORT_FORM_ITEM_QUANTITY_INVALID | 101321 | 422 | Item quantity must be an integer from 1 to 500 |
| IMPORT_FORM_ITEM_UNIT_PRICE_INVALID | 101322 | 422 | Item unit price must be a non-negative number with at most 2 decimal places |
| IMPORT_FORM_ITEM_NOTE_INVALID | 101323 | 422 | Item note must be a string |
| IMPORT_FORM_ITEM_MATERIAL_NOT_FOUND | 101325 | 404 | Item material not found |
| IMPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL | 101326 | 422 | Item unit is not attached to the material |
| IMPORT_FORM_ITEM_CONVERSION_RATE_INVALID | 101327 | 422 | Conversion rate of the item unit is invalid |
| IMPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE | 101328 | 422 | Item material is not assigned to this warehouse |
| IMPORT_FORM_FILE_TYPE_NOT_ALLOWED | 101329 | 422 | File type is not allowed (pdf, jpg, png, webp, xls, xlsx, doc, docx only) |
| IMPORT_FORM_ITEM_SUPPLIER_NOT_OF_MATERIAL | 101330 | 422 | Item supplier is not attached to the material |
| IMPORT_FORM_DATE_RANGE_INVALID | 101331 | 400 | startDate must not be after endDate |
| IMPORT_FORM_CODE_SEARCH_INVALID | 101332 | 400 | code may only contain letters, digits, "_" and "-" |
| IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID | 101333 | 422 | Item expiry date must be a valid date in YYYY-MM-DD format, not before the form date |
| IMPORT_FORM_VERSION_INVALID | 101334 | 422 | version is required and must be an integer >= 1 (from the most recent GET) |
| IMPORT_FORM_ITEM_BARCODE_INVALID | 101335 | 422 | Item barcode must be 8-14 digits |
| IMPORT_FORM_ITEM_NOT_FOUND | 101336 | 404 | Import form item not found |

Mã 101302–101305 (mã phiếu nhập tay), 101309 và 101324 (`IMPORT_FORM_ITEM_DUPLICATED` — từ WR-5 cùng vật tư/đơn vị lặp lại
1 dòng mỗi đơn vị) đã bỏ, không cấp lại.

Mã từ module khác mà các route này có thể trả: `DATA_VERSION_CONFLICT` 100800 (409), `WAREHOUSE_NOT_FOUND` 100501 (404),
`WAREHOUSE_ACCESS_DENIED` 100523 (403, từ guard), `USER_NOT_FOUND` 100405 (404), `SUPPLIER_NOT_FOUND` 101201 (404),
`INVENTORY_NOT_FOUND` 100801 (404), `FILE_*` 121000–121009 (422).

## Ghi chú cho FE

1. **Optimistic lock `version`:** PATCH, confirm và cancel bắt buộc gửi `version` lấy từ response gần nhất. Gặp 409 thì
   phân biệt theo `code`: `100800` nghĩa là người khác vừa sửa phiếu, cần GET lại; `101314` nghĩa là phiếu không còn
   `DRAFT`. Sau mỗi thao tác ghi, luôn dùng `version` trong response, đừng tự cộng thêm 1. DELETE không cần `version`.
2. **Không có idempotency key.** Gửi lại confirm hoặc cancel sau khi request trước đã thành công sẽ nhận 409 (`100800`
   hoặc `101314`), không ghi gì thêm. Khi bị timeout hoặc mất mạng, hãy GET lại phiếu để biết trạng thái thật thay vì gửi lại ngay.
3. **Dòng phiếu (từ WR-5):** tạo phiếu rỗng, rồi mỗi lần quét gọi `POST /:slug/items` với `{ barcode, unitPrice }` (mặc định
   1 đơn vị, đơn vị cơ sở); nhập tay thì gửi `{ materialSlug, unitSlug, quantity, unitPrice }`. Hiển thị bảng phiếu bằng
   `groups`, in tem bằng `codes` trong response. Gỡ 1 đơn vị bằng `DELETE /:slug/items/:itemSlug`. PATCH không còn nhận `items`.
   Thêm/gỡ dòng làm `version` tăng — lấy `form.version` trong response trước khi confirm.
4. **List không có `items`.** Muốn hiển thị dòng thì gọi `GET /:slug`. Lưu ý: list phiếu **xuất** thì lại có `items`.
5. `total`, `amount`, `baseQuantity`, `conversionRate`, `status`, `requester*`, `approver*` đều do server tính hoặc gán.
   Gửi lên sẽ bị bỏ qua (`whitelist`). FE có thể tính trước để hiển thị, nhưng con số chuẩn là trong response.
   Làm tròn: `baseQuantity` 6 chữ số, `amount`/`total` 2 chữ số.
6. **`code`:** server tự trim và chuyển IN HOA. Mã đã dùng ở một phiếu **đã xoá** vẫn bị chặn (101305), nên không tái sử dụng được.
7. **File đính kèm:** gọi `upload-file` trước để lấy URL, sau đó gửi URL vào `file` khi POST/PATCH. Server không kiểm tra
   URL thuộc S3 và không xoá file cũ khi đổi `file`. Upload xong mà không lưu phiếu thì file vẫn nằm trên S3. URL là
   dạng URL S3 công khai, còn bucket có cho đọc công khai hay không thì **chưa xác minh**.
8. **Không xoá được field tuỳ chọn bằng `null`** khi PATCH (`pickDefined` bỏ `null`). Gửi chuỗi rỗng `""` sẽ lưu thành
   chuỗi rỗng (suy ra từ code, **chưa xác minh** bằng API thật).
9. **`supplierSlug` của dòng:** nếu slug không tồn tại, lỗi trả về là `SUPPLIER_NOT_FOUND` (101201, 404), không phải 101330.
   Mã 101330 chỉ xuất hiện khi `supplierSlug` không phải string. Gửi NCC chưa gắn với vật tư thì server **tự gắn** NCC đó
   vào vật tư (tác dụng phụ lên danh mục vật tư).
10. **`available-materials` cần `IMPORT_FORM_CREATE`.** User chỉ có `UPDATE_DRAFT(_OWN)` sẽ bị 403 ở route này dù vẫn sửa
    được dòng. Route này cũng bỏ qua `sort`/`startDate`/`endDate`.
11. `startDate`/`endDate` của list lọc theo `createdAt`, **không** theo `date` (ngày nhập trên chứng từ).
12. Huỷ phiếu cần `IMPORT_FORM_CONFIRM`, không phải quyền sửa. Người lập có `_OWN` không tự huỷ được phiếu của mình;
    họ chỉ có thể xoá (DELETE) phiếu nếu có quyền xoá.
13. Lỗi validate body chỉ trả **mã của lỗi đầu tiên** (`src/app/http-exception.filter.ts:30-38`). Lỗi trong `items[i]`
    được map về mã của field, nhưng response không cho biết `i` là dòng nào.
14. Lệch so với plan `docs/plans/1-create-module-export-form-soft-seal.md` §2: các điểm của plan về `expiryDate` và việc
    sinh lô khi confirm khớp với code. Code còn có thêm `supplierSlug` theo dòng (tự gắn NCC) và route `available-materials`,
    hai thứ này không có trong plan.

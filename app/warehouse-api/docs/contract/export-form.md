# Phiếu xuất kho (Export Form)

> Nguồn: `src/export-form/export-form.controller.ts`, `export-form.dto.ts`, `export-form.validation.ts`,
> `export-form.service.ts`, `export-form.mapper.ts`, `export-form.constants.ts`, `export-form.entity.ts`,
> `export-form-item.entity.ts`. Phần giữ chỗ trên lô và tồn kho nằm ở `src/material-batch/material-batch.service.ts`
> và `src/inventory/inventory.service.ts` (đường dẫn tính từ `app/warehouse-api`). Đối chiếu tại commit `5555273`.
> Base URL: `/api/v1`. Envelope, lỗi chung, auth, guard, phân trang: xem [conventions.md](conventions.md).

Mọi route nằm dưới `/api/v1/warehouses/:warehouseSlug/export-forms`, có `@WarehouseScope('warehouseSlug')` ở mức class
(`controller.ts:49-52`). User phải là manager/member của kho; `SUPER_ADMIN`/`ADMIN` được bỏ qua bước kiểm tra kho.
Khi thao tác trên một phiếu, service tìm phiếu theo cả `slug` phiếu và `warehouse.slug` (`service.ts:533-542`).

## Tóm tắt endpoint

| Method | Path | Quyền (authority / role) | Mô tả |
|---|---|---|---|
| POST | /api/v1/warehouses/:warehouseSlug/export-forms | `EXPORT_FORM_CREATE` | Tạo phiếu `DRAFT` kèm các dòng vật tư |
| POST | /api/v1/warehouses/:warehouseSlug/export-forms/upload-file | Một trong `EXPORT_FORM_CREATE` / `EXPORT_FORM_UPDATE_DRAFT` / `EXPORT_FORM_UPDATE_DRAFT_OWN` (service kiểm tra) | Upload file đính kèm lên S3 và nhận link |
| GET | /api/v1/warehouses/:warehouseSlug/export-forms | `EXPORT_FORM_READ` | Danh sách phiếu có phân trang (**có kèm `items`**) |
| GET | /api/v1/warehouses/:warehouseSlug/export-forms/:slug | `EXPORT_FORM_READ` | Chi tiết phiếu kèm `items` |
| PATCH | /api/v1/warehouses/:warehouseSlug/export-forms/:slug | `EXPORT_FORM_UPDATE_DRAFT`, hoặc `EXPORT_FORM_UPDATE_DRAFT_OWN` với phiếu mình lập (service kiểm tra) | Sửa một phần phiếu `DRAFT` |
| POST | /api/v1/warehouses/:warehouseSlug/export-forms/:slug/submit | `EXPORT_FORM_UPDATE_DRAFT`, hoặc `EXPORT_FORM_UPDATE_DRAFT_OWN` với phiếu mình lập (service kiểm tra) | `DRAFT → PENDING`: giữ chỗ trên lô và tồn kho |
| POST | /api/v1/warehouses/:warehouseSlug/export-forms/:slug/confirm | `EXPORT_FORM_CONFIRM`; phiếu `DISPOSAL` cần thêm `EXPORT_FORM_APPROVE_DISPOSAL` | `PENDING → CONFIRMED`: trừ phần đã giữ chỗ |
| POST | /api/v1/warehouses/:warehouseSlug/export-forms/:slug/cancel | `EXPORT_FORM_CONFIRM` | `DRAFT`/`PENDING → CANCELLED`, trả lại phần đã giữ chỗ |
| DELETE | /api/v1/warehouses/:warehouseSlug/export-forms/:slug | `EXPORT_FORM_DELETE_DRAFT`, hoặc `EXPORT_FORM_DELETE_DRAFT_OWN` với phiếu mình lập (service kiểm tra) | Xoá mềm phiếu `DRAFT` |

Tổng: **9 endpoint**. Module này **không có** route kiểu `available-materials` như phiếu nhập. Để chọn vật tư hoặc lô,
FE dùng API của module inventory / material-batch.

Quyền mặc định lúc seed (`src/migrations/1783728000012-seed-warehouse-form-authorities.ts:100-155`) chỉ để tham khảo.
Lúc chạy, nguồn chuẩn là `permission_tbl`.

| Authority | Role được cấp lúc seed |
|---|---|
| `EXPORT_FORM_CREATE` | ADMIN, SUPERVISOR |
| `EXPORT_FORM_READ` | ADMIN, MANAGER, SUPERVISOR |
| `EXPORT_FORM_UPDATE_DRAFT` | ADMIN |
| `EXPORT_FORM_UPDATE_DRAFT_OWN` | SUPERVISOR |
| `EXPORT_FORM_DELETE_DRAFT` | ADMIN, MANAGER |
| `EXPORT_FORM_DELETE_DRAFT_OWN` | SUPERVISOR |
| `EXPORT_FORM_CONFIRM` | ADMIN, MANAGER |
| `EXPORT_FORM_APPROVE_DISPOSAL` | ADMIN, MANAGER |
| `EXPORT_FORM_EXPORT` | ADMIN, MANAGER, SUPERVISOR (chưa có route nào dùng quyền này) |

`SUPER_ADMIN` bypass mọi kiểm tra authority, kể cả các kiểm tra trong service (`src/authority/authority-check.util.ts:17,36`).

## Vòng đời trạng thái

`ExportFormStatus` (`constants.ts:12-17`): `DRAFT` | `PENDING` | `CONFIRMED` | `CANCELLED`.
`ExportFormType` (`constants.ts:23-29`): `PRODUCTION` | `DISPOSAL` | `TRANSFER` | `SALE` | `OTHER` (lý do xuất).

```
DRAFT --submit--> PENDING --confirm--> CONFIRMED
  |                  |
  +-----cancel-------+-----cancel-----> CANCELLED
```

| Từ | Sang | Endpoint | Ai làm | Lô (`MaterialBatch`) | Tồn kho (lịch sử) |
|---|---|---|---|---|---|
| (mới) | `DRAFT` | `POST /export-forms` | Có `EXPORT_FORM_CREATE`. User được ghi vào `requester` | Không đụng | Không đụng |
| `DRAFT` | `DRAFT` | `PATCH /:slug` | `UPDATE_DRAFT` hoặc `UPDATE_DRAFT_OWN` (phiếu mình lập) | Không đụng | Không đụng |
| `DRAFT` | (xoá mềm) | `DELETE /:slug` | `DELETE_DRAFT` hoặc `DELETE_DRAFT_OWN` (phiếu mình lập) | Không đụng | Không đụng |
| `DRAFT` | `PENDING` | `POST /:slug/submit` | `UPDATE_DRAFT` hoặc `UPDATE_DRAFT_OWN` (phiếu mình lập). **Không** ghi `approver` | Giữ chỗ: `reservedQuantity += q` (lô chỉ định, hoặc chọn theo FEFO). Dòng có thể bị **tách** theo lô | `reservedQuantity += q` (lịch sử `RESERVE`) |
| `PENDING` | `CONFIRMED` | `POST /:slug/confirm` | Có `EXPORT_FORM_CONFIRM`. Phiếu `DISPOSAL` cần thêm `EXPORT_FORM_APPROVE_DISPOSAL`. Ghi `approver` | Trên đúng lô đã giữ: `remaining -= q`, `reserved -= q`. Lô hết hàng chuyển trạng thái hết hàng | `quantity -= q`, `reserved -= q` (lịch sử `EXPORT`) |
| `DRAFT` | `CANCELLED` | `POST /:slug/cancel` | Có `EXPORT_FORM_CONFIRM`. Ghi `approver` | Không đụng | Không đụng |
| `PENDING` | `CANCELLED` | `POST /:slug/cancel` | Có `EXPORT_FORM_CONFIRM` (huỷ phiếu `DISPOSAL` **không** cần `APPROVE_DISPOSAL`). Ghi `approver` | Trả lại chỗ: `reserved -= q` | `reserved -= q` (lịch sử `RELEASE`) |

Nguồn: `service.ts:282-325` (submit), `332-367` (confirm), `373-407` (cancel). Mỗi bước chạy trong **1 transaction**:
lỗi ở bất kỳ đâu thì rollback toàn bộ, phiếu giữ nguyên trạng thái cũ.

- Chỉ `DRAFT` sửa, xoá và submit được. Phiếu `PENDING` đã bị "niêm phong mềm": không sửa, không xoá, không submit lại,
  chỉ confirm hoặc cancel được. `CONFIRMED`/`CANCELLED` là bất biến.
- **Giữ chỗ không tự hết hạn.** Phiếu `PENDING` giữ chỗ cho tới khi được confirm hoặc cancel (plan 2: "No auto-expiry").

### Giữ chỗ (reserve) khi submit: chi tiết FE cần biết

Nguồn: `src/material-batch/material-batch.service.ts:173-222` (reserve), `273-330` (khoá và ghi), `58-69` (FEFO);
`src/inventory/inventory.service.ts:312-331`.

1. Server khoá đầu phiếu (`pessimistic_write`), rồi kiểm tra lại `status = DRAFT` và `version` trên bản đã khoá (`service.ts:413-428`).
2. Với mỗi vật tư, server khoá mọi lô **còn hàng** của vật tư đó trong kho. Lượng còn trống của một lô là `remainingQuantity - reservedQuantity`.
   - Các dòng **có chỉ định lô** (`batchSlug`) được xử lý **trước**. Lô phải còn hàng và còn trống ≥ `baseQuantity`
     của dòng, nếu không trả `MATERIAL_BATCH_INSUFFICIENT` (409).
   - Các dòng **không chỉ định lô** chọn lô theo FEFO: lô có hạn dùng sớm nhất trước, lô không có hạn dùng xếp cuối;
     cùng hạn thì xét `entryDate`, rồi `createdAt`, rồi `id`. Server lấy lần lượt từ các lô cho đến khi đủ. Không đủ thì trả 409 `MATERIAL_BATCH_INSUFFICIENT`.
3. Giữ chỗ trên tồn kho: tổng theo vật tư phải ≤ `quantity - reservedQuantity`, nếu không trả 409 `INVENTORY_AVAILABLE_INSUFFICIENT`.
   Bước kiểm tra lô chạy trước, nên khi thiếu cả hai thì lỗi trả về là lỗi của lô.
4. **Tách dòng** (`service.ts:475-530`): dòng lấy từ 1 lô thì giữ nguyên và được gán `batch`. Dòng lấy từ N lô bị tách
   thành N dòng, mỗi dòng 1 lô. Dòng đầu ghi đè lên dòng cũ (giữ `slug`), N−1 dòng sau là dòng mới (slug mới).
   Ở các dòng không phải dòng cuối: `quantity = round6(baseQuantity_phần / conversionRate)`, `amount = round2(quantity × unitPrice)`.
   Dòng **cuối** nhận phần còn lại, để tổng `quantity`/`amount` của dòng gốc giữ nguyên tuyệt đối. Sau đó server đánh lại `lineNo` từ 1..n.
   `totalAmount` của phiếu không đổi.
5. Server đổi `status = PENDING` và lưu. `version` tăng.

Khi confirm, server **không chọn lại lô và không tách dòng**. Nó trừ đúng các lô đã gán trên từng dòng (`consumeReserved`).
Nếu dữ liệu giữ chỗ trên lô không khớp với phiếu thì trả 409 `MATERIAL_BATCH_RESERVED_INVALID`.

---

## POST /api/v1/warehouses/:warehouseSlug/export-forms

- **Quyền:** `EXPORT_FORM_CREATE` (`controller.ts:57`) + warehouse scope.
- **Path params:** `warehouseSlug`. Kho phải tồn tại và `isActive` (`service.ts:139-141`).
- **Body** (`CreateExportFormRequestDto`, `dto.ts:91-152`; `whitelist: true` bỏ `status`, `totalAmount`, ...):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| code | string | có | Được trim. `^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$` (2–32 ký tự) | Server chuyển IN HOA (`mapper.ts:23-26`). Unique trên mọi phiếu xuất, kể cả phiếu đã xoá mềm |
| type | `'PRODUCTION' \| 'DISPOSAL' \| 'TRANSFER' \| 'SALE' \| 'OTHER'` | có | enum | `DISPOSAL` = xuất huỷ, confirm cần thêm quyền |
| purchaseOrder | string | **có** | Không rỗng, ≤ 64 ký tự | Khác phiếu nhập: ở đây bắt buộc |
| invoiceCode | string | không | ≤ 64 ký tự | Không gửi thì lưu `null` (`service.ts:150`) |
| receiver | string | có | Không rỗng, ≤ 255 ký tự | Người hoặc bộ phận nhận hàng, chuỗi tự do |
| file | string | không | ≤ 1024 ký tự | Link nhận từ `POST .../upload-file` |
| note | string | không | Không có validator kiểu (xem Ghi chú cho FE) | |
| items | `CreateExportFormItemDto[]` | có | 1–200 phần tử | Thứ tự trong mảng = `lineNo` 1..n |

`items[]` (`CreateExportFormItemDto`, `dto.ts:42-84`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| materialSlug | string (slug) | có | Không rỗng | Vật tư phải tồn tại và đã gán vào kho |
| unitSlug | string (slug) | có | Không rỗng | Phải là đơn vị gắn với vật tư |
| quantity | number | có | > 0, ≤ 6 chữ số thập phân, không dùng dạng mũ. `quantity` và `baseQuantity` phải < 1e12 | |
| unitPrice | number | có | ≥ 0, ≤ 2 chữ số thập phân. `amount` phải < 1e16 | |
| note | string | không | Phải là string | |
| batchSlug | string (slug) | không | Có gửi thì phải là chuỗi không rỗng | Lô phải thuộc kho này, của đúng vật tư này, và đang **còn hàng** (`service.ts:654-668`). Không gửi thì lô được chọn theo FEFO **lúc submit** |

Khi tạo hoặc PATCH, server **không** kiểm tra đủ tồn hay đủ lô; việc này làm lúc submit (`service.ts:553-558`).
Không được có 2 dòng trùng bộ `(materialSlug, unitSlug, batchSlug)`. Một dòng có `batchSlug` và một dòng không có được coi là khác nhau.
Server tự tính: `conversionRate` (chụp lúc ghi), `baseQuantity`, `amount`, `totalAmount = Σ amount`, mã/tên vật tư và đơn vị.

- **Response 201:** `ExportFormResponseDto` kèm `items`. Xem [Dạng response](#dạng-response).
- **Lỗi riêng** (thứ tự theo `service.ts:133-167`, `559-651`):

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101402 / 101403 | `code` thiếu / sai format |
| 422 | 101406 | `type` sai enum |
| 422 | 101407 / 101408 | `purchaseOrder` thiếu / dài hơn 64 ký tự |
| 422 | 101409 | `invoiceCode` dài hơn 64 ký tự |
| 422 | 101410 / 101411 | `receiver` thiếu / dài hơn 255 ký tự |
| 422 | 101413 | `file` sai |
| 422 | 101418 / 101419 | `items` thiếu hoặc rỗng / quá 200 dòng |
| 422 | 101420–101424, 101433 | Field trong `items[i]` không hợp lệ |
| 404 | 100501 | Không có kho |
| 422 | 101417 | Kho đang tắt |
| 422 | 101404 / 101405 | `code` đã được dùng / bị giữ bởi phiếu đã xoá mềm |
| 422 | 101425 | Trùng `(material, unit, batch)` |
| 404 | 101426 | Không tìm thấy vật tư |
| 422 | 101429 | Vật tư chưa gán vào kho |
| 422 | 101427 | Đơn vị không gắn với vật tư |
| 422 | 101428 | Tỉ lệ quy đổi trong DB không hợp lệ |
| 404 | 101430 | Lô không tồn tại hoặc thuộc kho khác |
| 422 | 101431 | Lô không thuộc vật tư của dòng |
| 422 | 101432 | Lô đã hết hàng |
| 422 | 101422 | `quantity`/`baseQuantity` vượt giới hạn hoặc `baseQuantity` ≤ 0 |
| 422 | 101412 | `amount` hoặc `totalAmount` ≥ 1e16 |
| 404 | 100405 | User trong JWT không còn tồn tại |

## POST /api/v1/warehouses/:warehouseSlug/export-forms/upload-file

- **Quyền:** Route không gắn `@RequireAuthority`. Service yêu cầu có một trong `EXPORT_FORM_CREATE`, `EXPORT_FORM_UPDATE_DRAFT`,
  `EXPORT_FORM_UPDATE_DRAFT_OWN` (`service.ts:116-120`). Vẫn áp dụng warehouse scope.
- **Body:** `multipart/form-data`, field `file`. Ràng buộc giống phiếu nhập: ≤ 10MB, đuôi file và mimetype phải khớp
  allowlist pdf/jpg/jpeg/png/webp/xls/xlsx/doc/docx.
- **Response 201:** `result` là `string`: URL S3 dạng `https://<bucket>.s3.<region>.amazonaws.com/export-forms/<key>`.
- **Lỗi riêng** (theo thứ tự `service.ts:116-126`):

| HTTP | code | Khi nào |
|---|---|---|
| 403 | — | Không có quyền nào trong 3 quyền trên |
| 404 | 100501 | Không có kho (khác phiếu nhập: route này có kiểm tra kho) |
| 422 | 101417 | Kho đang tắt |
| 422 | 121000 | Không gửi `file` |
| 422 | 101434 | Đuôi file và mimetype không khớp allowlist |
| 422 | 121001–121009 | Lỗi multer (quá 10MB, sai tên field, ...) |

## GET /api/v1/warehouses/:warehouseSlug/export-forms

- **Quyền:** `EXPORT_FORM_READ` + warehouse scope.
- **Query** (`GetAllExportFormRequestDto`, `dto.ts:188-244`, kế thừa `BaseQueryDto`):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| status | `'DRAFT' \| 'PENDING' \| 'CONFIRMED' \| 'CANCELLED'` | không | enum | |
| type | `'PRODUCTION' \| 'DISPOSAL' \| 'TRANSFER' \| 'SALE' \| 'OTHER'` | không | enum | |
| code | string | không | Chuyển IN HOA, khớp `^[A-Z0-9_-]+$` | Khớp tiền tố |
| invoiceCode | string | không | ≤ 64 ký tự | Khớp tiền tố |
| purchaseOrder | string | không | ≤ 64 ký tự | Khớp tiền tố |
| requesterSlug / approverSlug | string | không | | Khớp chính xác |
| sortBy | `'createdAt' \| 'code'` | không | mặc định `createdAt` | |
| startDate / endDate | string | không | | Lọc theo `createdAt` |

- **Response 200:** `AppPaginatedResponseDto<ExportFormResponseDto>`. **Mỗi phần tử có kèm `items`** (load cả `material`,
  `unit`, `batch`), sắp theo `lineNo` (`service.ts:190-199`).
- **Lỗi riêng:** 422 101414 (`status` sai), 422 101406 (`type` sai), 400 101436 (`code` sai ký tự),
  422 101409/101408 (quá dài), 400 101435 (`startDate` sau `endDate`), 404 100501 (không có kho).

## GET /api/v1/warehouses/:warehouseSlug/export-forms/:slug

- **Quyền:** `EXPORT_FORM_READ` + warehouse scope.
- **Response 200:** `ExportFormResponseDto` kèm `items`, sắp theo `lineNo`.
- **Lỗi riêng:** 404 101401 (không có phiếu, phiếu đã xoá mềm, hoặc phiếu thuộc kho khác).

## PATCH /api/v1/warehouses/:warehouseSlug/export-forms/:slug

- **Quyền:** service kiểm tra `EXPORT_FORM_UPDATE_DRAFT`, hoặc `EXPORT_FORM_UPDATE_DRAFT_OWN` với phiếu mình lập
  (`service.ts:221-226`, `676-689`). Không có quyền nào: 403 không có `code`. Chỉ có `_OWN` nhưng không phải người lập: 403 `101416`.
- **Body** (`UpdateExportFormRequestDto`, `dto.ts:158-168`): mọi field của POST đều tuỳ chọn, cộng thêm `version`
  (number int ≥ 1, **bắt buộc**).
  - Field vắng mặt hoặc `null`: giữ nguyên giá trị cũ.
  - Có gửi `items` (khác `null`): thay **toàn bộ** các dòng và tính lại `totalAmount` (`service.ts:230-253`).
- **Response 200:** `ExportFormResponseDto` kèm `items`.
- **Lỗi riêng:** 422 101439 (`version` không hợp lệ), 404 101401, 409 100800 (sai version), 409 101415 (không còn `DRAFT`,
  bao gồm cả `PENDING`), 403 / 403 101416, 422 101404/101405, và các lỗi validate hoặc lỗi dòng giống POST.

## POST /api/v1/warehouses/:warehouseSlug/export-forms/:slug/submit

- **Quyền:** Route không gắn `@RequireAuthority`. Service yêu cầu `EXPORT_FORM_UPDATE_DRAFT`, hoặc `EXPORT_FORM_UPDATE_DRAFT_OWN`
  với phiếu mình lập (`service.ts:291-296`).
- **Body** (`ChangeExportFormStatusRequestDto`, `dto.ts:171-180`): `{ version: number }` (int ≥ 1, bắt buộc).
- **Response 200:** `ExportFormResponseDto` với `status = 'PENDING'`. `items` là danh sách **sau khi tách**: mọi dòng đều đã có
  `batchSlug`, `lineNo` được đánh lại. `approverSlug`/`approverName` vẫn là `null`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101439 | `version` không hợp lệ |
| 404 | 101401 | Không có phiếu |
| 409 | 100800 | Sai `version` (kiểm tra cả lúc đọc và trên bản đã khoá) |
| 409 | 101415 | Phiếu không còn `DRAFT` (kiểm tra cả lúc đọc và trên bản đã khoá) |
| 403 | — / 101416 | Không có quyền / chỉ có `_OWN` nhưng không phải người lập |
| 404 | 101426 | Vật tư của một dòng đã bị xoá mềm (`service.ts:447-453`) |
| 409 | 101502 `MATERIAL_BATCH_INSUFFICIENT` | Lô chỉ định không còn hàng hoặc không đủ chỗ trống, hoặc FEFO không gom đủ lượng |
| 409 | 100817 `INVENTORY_AVAILABLE_INSUFFICIENT` | `quantity - reservedQuantity` của tồn kho không đủ |
| 404 | 100801 `INVENTORY_NOT_FOUND` | Vật tư đã bị gỡ khỏi kho |
| 409 | 101505 `MATERIAL_BATCH_RESERVED_INVALID` | Bất biến `0 ≤ reserved ≤ remaining` của lô bị vi phạm (dữ liệu hỏng) |
| 422 | 100812 `INVENTORY_QUANTITY_BELOW_RESERVED` | Bất biến tồn kho bị vi phạm (dữ liệu hỏng) |

## POST /api/v1/warehouses/:warehouseSlug/export-forms/:slug/confirm

- **Quyền:** `EXPORT_FORM_CONFIRM` (guard). Nếu `type = DISPOSAL`, service yêu cầu thêm `EXPORT_FORM_APPROVE_DISPOSAL`
  (`service.ts:343-344`), không có thì trả 403 không có `code`. Không kiểm tra người lập.
- **Body:** `{ version: number }`.
- **Response 200:** `ExportFormResponseDto` với `status = 'CONFIRMED'`, có `approverSlug`/`approverName`. `items` giữ nguyên như lúc submit.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 101439 | `version` không hợp lệ |
| 404 | 101401 | Không có phiếu |
| 409 | 100800 | Sai `version` |
| 409 | 101437 `EXPORT_FORM_NOT_PENDING` | Phiếu không ở `PENDING`, ví dụ còn `DRAFT` và cần submit trước (kiểm tra cả lúc đọc và trên bản đã khoá) |
| 403 | — | Phiếu `DISPOSAL` mà user không có `EXPORT_FORM_APPROVE_DISPOSAL` |
| 404 | 101426 | Vật tư của một dòng đã bị xoá mềm |
| 409 | 101505 | Lô đã giữ chỗ không còn trong tập lô còn hàng, hoặc lượng giữ không khớp |
| 422 | 100806 / 100812 | Bất biến tồn kho bị vi phạm (`INVENTORY_QUANTITY_NEGATIVE` / `_BELOW_RESERVED`) |
| 404 | 100801 | Vật tư không còn được gán vào kho |
| 404 | 100405 | User trong JWT không còn tồn tại |

## POST /api/v1/warehouses/:warehouseSlug/export-forms/:slug/cancel

- **Quyền:** `EXPORT_FORM_CONFIRM` (guard). Không cần `APPROVE_DISPOSAL`, kể cả với phiếu `DISPOSAL`.
- **Body:** `{ version: number }`.
- **Response 200:** `ExportFormResponseDto` với `status = 'CANCELLED'`, có `approverSlug`/`approverName` (là người huỷ).
  Huỷ phiếu `PENDING` trả lại phần đã giữ chỗ trên lô và tồn kho. Các dòng đã tách **không** được gộp lại, vẫn giữ `batchSlug`.
- **Lỗi riêng:** 422 101439, 404 101401, 409 100800, 409 101438 `EXPORT_FORM_CANNOT_BE_CANCELLED` (phiếu đã `CONFIRMED`/`CANCELLED`,
  hoặc trạng thái đổi trước khi lấy được khoá), 404 101426, 409 101505, 422 100812, 404 100801, 404 100405.

## DELETE /api/v1/warehouses/:warehouseSlug/export-forms/:slug

- **Quyền:** service kiểm tra `EXPORT_FORM_DELETE_DRAFT`, hoặc `EXPORT_FORM_DELETE_DRAFT_OWN` với phiếu mình lập (`service.ts:257-275`).
- **Body:** không có, không cần `version`.
- **Response 200:** `result` là chuỗi `"1 export form have been deleted successfully"`. Phiếu và các dòng bị xoá mềm.
- **Lỗi riêng:** 404 101401, 409 101415 (không còn `DRAFT`; phiếu `PENDING` không xoá được, phải cancel), 403 / 403 101416.

---

## Dạng response

`ExportFormResponseDto` (`dto.ts:306-365`, `mapper.ts:84-111`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug, createdAt, updatedAt | string | |
| version | number | Gửi lại khi PATCH/submit/confirm/cancel |
| code | string | IN HOA |
| type | `ExportFormType` | |
| status | `'DRAFT' \| 'PENDING' \| 'CONFIRMED' \| 'CANCELLED'` | |
| purchaseOrder | string | |
| invoiceCode | string \| null | |
| requesterSlug | string \| null | |
| requesterName | string | Chụp lúc tạo phiếu |
| approverSlug, approverName | string \| null | Chỉ có sau confirm/cancel. Submit **không** ghi các field này |
| receiver | string | |
| totalAmount | number | Σ `items.amount` (khác phiếu nhập, nơi field này tên là `total`) |
| note, file | string \| null | |
| warehouseSlug | string | |
| items | `ExportFormItemResponseDto[]` | Có ở **mọi** route trả phiếu, kể cả list |

`ExportFormItemResponseDto` (`dto.ts:246-304`, `mapper.ts:61-82`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| slug, createdAt, updatedAt | string | |
| lineNo | number | 1-based. Có thể bị đánh lại sau submit |
| materialSlug, materialCode, materialName | string | Mã và tên được chụp lúc ghi dòng |
| unitSlug, unitCode, unitName | string | |
| batchSlug | string \| null | `null` = dòng nháp chưa chỉ định lô. Sau submit luôn có giá trị |
| batchExpiryDate | string (`YYYY-MM-DD`) \| null | Hạn dùng của lô, đọc trực tiếp từ lô (không phải giá trị chụp) |
| quantity | number | Theo đơn vị của dòng |
| conversionRate | number | Chụp lúc ghi dòng |
| baseQuantity | number | Theo đơn vị cơ sở. Đây là lượng giữ chỗ và trừ |
| unitPrice | number | |
| amount | number | |
| note | string \| null | |

Ví dụ sau submit, khi 1 dòng 15 kg (không chỉ định lô) bị tách ra 2 lô:

```json
{
  "slug": "pxa1", "version": 2, "code": "PX-2026-0001", "type": "PRODUCTION", "status": "PENDING",
  "purchaseOrder": "PO-1", "invoiceCode": null, "receiver": "Xưởng A", "totalAmount": 150000,
  "approverSlug": null, "approverName": null, "warehouseSlug": "kho-a",
  "items": [
    { "lineNo": 1, "materialSlug": "m1", "unitSlug": "kg", "batchSlug": "lo-1", "batchExpiryDate": "2026-12-01",
      "quantity": 10, "baseQuantity": 10, "unitPrice": 10000, "amount": 100000 },
    { "lineNo": 2, "materialSlug": "m1", "unitSlug": "kg", "batchSlug": "lo-2", "batchExpiryDate": null,
      "quantity": 5, "baseQuantity": 5, "unitPrice": 10000, "amount": 50000 }
  ]
}
```

## Mã lỗi của module

Nguồn: `src/export-form/export-form.validation.ts:91-222`. HTTP mặc định là 422.

| Key | code | HTTP | message |
|---|---|---|---|
| EXPORT_FORM_NOT_FOUND | 101401 | 404 | Export form not found |
| EXPORT_FORM_CODE_IS_REQUIRED | 101402 | 422 | Export form code is required |
| EXPORT_FORM_CODE_INVALID | 101403 | 422 | Export form code must be 2-32 letters, digits or hyphens |
| EXPORT_FORM_CODE_DOES_EXIST | 101404 | 422 | Export form code does exist |
| EXPORT_FORM_CODE_RESERVED_BY_DELETED_EXPORT_FORM | 101405 | 422 | Export form code is still held by a deleted export form |
| EXPORT_FORM_TYPE_INVALID | 101406 | 422 | Type must be one of PRODUCTION, DISPOSAL, TRANSFER, SALE, OTHER |
| EXPORT_FORM_PURCHASE_ORDER_IS_REQUIRED | 101407 | 422 | Purchase order is required |
| EXPORT_FORM_PURCHASE_ORDER_INVALID | 101408 | 422 | Purchase order must be at most 64 characters |
| EXPORT_FORM_INVOICE_CODE_INVALID | 101409 | 422 | Invoice code must be at most 64 characters |
| EXPORT_FORM_RECEIVER_IS_REQUIRED | 101410 | 422 | Receiver is required |
| EXPORT_FORM_RECEIVER_INVALID | 101411 | 422 | Receiver must be at most 255 characters |
| EXPORT_FORM_TOTAL_INVALID | 101412 | 422 | Total or item amount exceeds the maximum supported value |
| EXPORT_FORM_FILE_INVALID | 101413 | 422 | File must be a string of at most 1024 characters |
| EXPORT_FORM_STATUS_INVALID | 101414 | 422 | Status must be one of DRAFT, CONFIRMED, CANCELLED |
| EXPORT_FORM_NOT_DRAFT | 101415 | 409 | Only a DRAFT export form can be changed |
| EXPORT_FORM_NOT_OWNER | 101416 | 403 | You can only change export forms you requested |
| EXPORT_FORM_WAREHOUSE_INACTIVE | 101417 | 422 | Cannot create an export form for an inactive warehouse |
| EXPORT_FORM_ITEMS_IS_REQUIRED | 101418 | 422 | Export form must have at least 1 item |
| EXPORT_FORM_ITEMS_TOO_MANY | 101419 | 422 | Export form can have at most 200 items |
| EXPORT_FORM_ITEM_MATERIAL_SLUG_IS_REQUIRED | 101420 | 422 | Item material slug is required |
| EXPORT_FORM_ITEM_UNIT_SLUG_IS_REQUIRED | 101421 | 422 | Item unit slug is required |
| EXPORT_FORM_ITEM_QUANTITY_INVALID | 101422 | 422 | Item quantity must be a positive number with at most 6 decimal places |
| EXPORT_FORM_ITEM_UNIT_PRICE_INVALID | 101423 | 422 | Item unit price must be a non-negative number with at most 2 decimal places |
| EXPORT_FORM_ITEM_NOTE_INVALID | 101424 | 422 | Item note must be a string |
| EXPORT_FORM_ITEM_DUPLICATED | 101425 | 422 | The same material, unit and batch appear more than once in the form |
| EXPORT_FORM_ITEM_MATERIAL_NOT_FOUND | 101426 | 404 | Item material not found |
| EXPORT_FORM_ITEM_UNIT_NOT_OF_MATERIAL | 101427 | 422 | Item unit is not attached to the material |
| EXPORT_FORM_ITEM_CONVERSION_RATE_INVALID | 101428 | 422 | Conversion rate of the item unit is invalid |
| EXPORT_FORM_ITEM_MATERIAL_NOT_IN_WAREHOUSE | 101429 | 422 | Item material is not assigned to this warehouse |
| EXPORT_FORM_ITEM_BATCH_NOT_FOUND | 101430 | 404 | Item batch not found in this warehouse |
| EXPORT_FORM_ITEM_BATCH_NOT_OF_MATERIAL | 101431 | 422 | Item batch does not belong to the item material |
| EXPORT_FORM_ITEM_BATCH_OUT_OF_STOCK | 101432 | 422 | Item batch is out of stock |
| EXPORT_FORM_ITEM_BATCH_SLUG_INVALID | 101433 | 422 | Item batch slug must be a string |
| EXPORT_FORM_FILE_TYPE_NOT_ALLOWED | 101434 | 422 | File type is not allowed (pdf, jpg, png, webp, xls, xlsx, doc, docx only) |
| EXPORT_FORM_DATE_RANGE_INVALID | 101435 | 400 | startDate must not be after endDate |
| EXPORT_FORM_CODE_SEARCH_INVALID | 101436 | 400 | code may only contain letters, digits, "_" and "-" |
| EXPORT_FORM_NOT_PENDING | 101437 | 409 | Only a PENDING export form can be confirmed (submit the draft first) |
| EXPORT_FORM_CANNOT_BE_CANCELLED | 101438 | 409 | Only a DRAFT or PENDING export form can be cancelled |
| EXPORT_FORM_VERSION_INVALID | 101439 | 422 | version is required and must be an integer >= 1 (from the most recent GET) |

Mã từ module khác mà các route này có thể trả: `DATA_VERSION_CONFLICT` 100800 (409), `WAREHOUSE_NOT_FOUND` 100501 (404),
`WAREHOUSE_ACCESS_DENIED` 100523 (403), `USER_NOT_FOUND` 100405 (404), `INVENTORY_NOT_FOUND` 100801 (404),
`INVENTORY_QUANTITY_NEGATIVE` 100806 (422), `INVENTORY_QUANTITY_BELOW_RESERVED` 100812 (422),
`INVENTORY_AVAILABLE_INSUFFICIENT` 100817 (409), `MATERIAL_BATCH_INSUFFICIENT` 101502 (409),
`MATERIAL_BATCH_RESERVED_INVALID` 101505 (409), `FILE_*` 121000–121009 (422).

## Ghi chú cho FE

1. **Luồng mới bắt buộc có submit.** Thứ tự là `DRAFT` → submit → `PENDING` → confirm. Gọi confirm trên phiếu `DRAFT` sẽ nhận
   409 `101437`. Lỗi thiếu lô hoặc thiếu tồn (101502 / 100817) xuất hiện **ở bước submit**, không phải ở confirm.
2. **Trạng thái `PENDING`:** phiếu không sửa và không xoá được (PATCH/DELETE trả 409 `101415`). Muốn sửa thì cancel rồi tạo phiếu mới.
   Hiện không có endpoint đưa phiếu từ `PENDING` về lại `DRAFT`.
3. **Optimistic lock `version`:** PATCH, submit, confirm và cancel bắt buộc gửi `version` mới nhất. Sau mỗi thao tác, lấy `version`
   từ response, đừng tự cộng 1. Gặp 409: code `100800` nghĩa là cần GET lại; code `101415`/`101437`/`101438` nghĩa là trạng thái
   phiếu đã thay đổi.
4. **Không có idempotency key.** Gửi lại submit/confirm/cancel sau khi request trước đã thành công sẽ nhận 409 (sai version hoặc
   sai trạng thái), không giữ chỗ hay trừ tồn hai lần. Khi bị timeout, hãy GET lại phiếu trước khi thử lại.
5. **Item lồng nhau và tách dòng:** sau submit, số dòng có thể tăng, `lineNo` bị đánh lại, và các dòng mới có `slug` mới.
   FE không được giữ `slug` hay `lineNo` của dòng từ lúc nháp để đối chiếu sau submit. Tổng `quantity`/`amount` của dòng gốc
   và `totalAmount` được giữ nguyên chính xác.
6. **`batchSlug`:** nếu gửi, lô phải đang còn hàng ngay lúc tạo hoặc PATCH, nếu không trả 422 `101432`. Nếu đến lúc submit lô đã hết
   hoặc không đủ chỗ trống, lỗi trả về là 409 `101502` (không phải 101432). Chỗ trống của lô = `remaining - reserved`, tức đã trừ
   phần các phiếu `PENDING` khác đang giữ.
7. **Xuất huỷ (`DISPOSAL`):** người confirm cần thêm `EXPORT_FORM_APPROVE_DISPOSAL`. SUPERVISOR mặc định tạo được nhưng không tự duyệt được.
   Cancel thì không cần quyền này. Nên ẩn hoặc vô hiệu nút "Xác nhận" theo `type` và quyền của user.
8. **Ai submit:** người có quyền sửa nháp (bản đầy đủ hoặc `_OWN`), không phải người có quyền confirm. MANAGER mặc định không có
   `EXPORT_FORM_UPDATE_DRAFT*`, nên không submit được.
9. **List có kèm `items`.** Mỗi phiếu trả toàn bộ dòng, nên `size` lớn sẽ làm payload nặng. Khác phiếu nhập (list phiếu nhập không có `items`).
10. **File đính kèm:** giống phiếu nhập: upload trước để lấy URL, rồi gửi URL vào `file`. Route upload của phiếu xuất có kiểm tra kho
    tồn tại và đang hoạt động.
11. PATCH không xoá được field tuỳ chọn bằng `null`. Gửi `""` thì lưu chuỗi rỗng (**chưa xác minh** bằng API thật).
12. `EXPORT_FORM_STATUS_INVALID` (101414) có message liệt kê thiếu `PENDING`, nhưng `PENDING` vẫn là giá trị lọc hợp lệ.
13. **Lệch so với plan:**
    - `docs/plans/1-create-module-export-form-soft-seal.md` §4 viết: vòng đời `DRAFT → CONFIRMED | CANCELLED`, kiểm tra tồn và
      chọn lô theo FEFO lúc **confirm**, tách dòng lúc confirm, cancel chỉ đổi trạng thái. **Code hiện tại khác plan:** có thêm
      `PENDING`; giữ chỗ, chọn FEFO và tách dòng diễn ra lúc **submit**; confirm chỉ trừ phần đã giữ; cancel phiếu `PENDING` có
      trả lại phần giữ chỗ. Plan 1 không nói tới `submit`, `reservedQuantity`, mã 101437/101438/101439.
    - `docs/plans/2-export-form-pending-reserve.md` khớp với code ở các điểm: luồng trạng thái, bảng reserve/consume/release,
      quyền submit, mã lỗi mới, và việc giữ chỗ không tự hết hạn.
    - Một số comment và mô tả Swagger trong code vẫn theo plan 1 (ghi "on confirm" cho FEFO và tách dòng): `constants.ts:3-7` và `34`,
      `dto.ts:38-41` và `72-78`, `dto.ts:248`, `export-form-item.entity.ts`. **Hành vi thật** là theo service như mô tả ở trên.

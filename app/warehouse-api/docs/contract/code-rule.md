# Quy tắc sinh mã (Code rule)

> Nguồn: `src/code-generate/code-rule.controller.ts`, `src/code-generate/code-rule.dto.ts`, `src/code-generate/code-rule.service.ts`, `src/code-generate/code-generate.service.ts`, `src/code-generate/code-generate.constants.ts`, `src/code-generate/code-generate.validation.ts` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).

Mỗi loại mã tự sinh (`CodeType`) có một quy tắc giữ **tiền tố** in lên mã. Có đủ 6 loại, seed sẵn ở migration `1783728000049`. API chỉ đọc và sửa quy tắc, không tạo hay xoá.

| `type` | Tiền tố mặc định | Định dạng mã | Dùng ở |
|---|---|---|---|
| `ITEM` | `IT` | `{prefix}-{warehouse.code}-{yymmdd}-{seq:6}` | `POST /warehouses/:warehouseSlug/materials` khi không gửi `material.code` |
| `IMPORT_FORM` | `IM` | như trên | Mã phiếu nhập |
| `EXPORT_FORM` | `EX` | như trên | Mã phiếu xuất |
| `BALANCE_FORM` | `BL` | như trên | Chưa dùng |
| `SHELF` | `SH` | như trên | Chưa dùng |
| `BARCODE` | `20` | EAN-13 `{prefix:2}{số kho:3}{seq:7}{check}` | `POST /warehouses/:warehouseSlug/materials/barcode` |

- Bộ đếm `seq` của mã chữ reset theo (loại, kho, ngày giờ Việt Nam). Bộ đếm mã vạch chạy theo (kho) và **không reset**.
- Chữ số kiểm tra EAN-13 theo chuẩn GS1 (mod 10, trọng số 1/3).
- Mã vạch **chỉ dùng cho vật tư** (`material.barcode`). Phiếu nhập/xuất chỉ có mã chữ (`code`).
- Số kho trong mã vạch (`001`…`999`) là thứ tự tạo của kho, tính cả kho đã xoá mềm, nên không đổi theo thời gian. Server tự tính khi sinh mã vạch; kho không có field nào cho mã vạch.
- Đổi tiền tố **không** làm cấp trùng: mã cũ giữ tiền tố cũ, bộ đếm vẫn chạy tiếp theo `type`. Mã mới sinh ra từ request kế tiếp dùng tiền tố mới.
- Tiền tố `20`–`29` là dải GS1 dành cho mã lưu hành nội bộ. Nên giữ `BARCODE` trong dải này để không trùng mã vạch thật của nhà sản xuất.

## Tóm tắt endpoint

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | /api/v1/code-rules | `CODE_RULE_READ` | Danh sách quy tắc |
| GET | /api/v1/code-rules/:type | `CODE_RULE_READ` | Một quy tắc |
| PATCH | /api/v1/code-rules/:type | `CODE_RULE_UPDATE` | Sửa tiền tố / mô tả |

Quyền seed sẵn (migration `1783728000051`): `CODE_RULE_READ` cho `ADMIN`, `MANAGER`; `CODE_RULE_UPDATE` cho `ADMIN`.

## Kiểu dùng chung

### `CodeRuleResponseDto`

| Field | Kiểu | Ghi chú |
|---|---|---|
| `type` | `'ITEM' \| 'IMPORT_FORM' \| 'EXPORT_FORM' \| 'BALANCE_FORM' \| 'SHELF' \| 'BARCODE'` | Định danh của quy tắc, dùng trên path |
| `prefix` | `string` | 2 ký tự |
| `description` | `string \| null` | |
| `updatedAt` | `string` | |

Quy tắc không có `slug`/`createdAt`: `type` là định danh.

## GET /api/v1/code-rules

- **Quyền:** `CODE_RULE_READ`.
- **Response 200:** `result` là `CodeRuleResponseDto[]`, sắp theo `type`. Không phân trang.

## GET /api/v1/code-rules/:type

- **Quyền:** `CODE_RULE_READ`.
- **Path params:** `type`, không phân biệt hoa thường.
- **Response 200:** `result` là `CodeRuleResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 101608 `CODE_RULE_TYPE_INVALID` | `type` không thuộc danh sách trên |
| 404 | 101606 `CODE_RULE_NOT_FOUND` | Chưa seed (chưa chạy migration) |

## PATCH /api/v1/code-rules/:type

- **Quyền:** `CODE_RULE_UPDATE`.
- **Path params:** `type`, không phân biệt hoa thường.
- **Body** (partial, field không gửi giữ nguyên):

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `prefix` | `string` | Không | Trim, chuyển IN HOA, đúng 2 ký tự `A-Z 0-9`. Riêng `BARCODE`: đúng 2 chữ số | |
| `description` | `string` | Không | Trim, tối đa 255 ký tự | |

- **Response 200:** `result` là `CodeRuleResponseDto` sau khi sửa.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 101607 `CODE_RULE_PREFIX_INVALID` | `prefix` sai định dạng, hoặc `BARCODE` có chữ cái |
| 400 | 101609 `CODE_RULE_DESCRIPTION_INVALID` | `description` không phải chuỗi hoặc dài hơn 255 |
| 400 | 101608 `CODE_RULE_TYPE_INVALID` | `type` không hợp lệ |
| 404 | 101606 `CODE_RULE_NOT_FOUND` | Chưa seed |

## Mã lỗi của module

Nguồn: `src/code-generate/code-generate.validation.ts` (`CodeGenerateValidation`, dải 1016xx). HTTP mặc định của `createErrorCode` là 422.

| Key | code | HTTP | message |
|---|---|---|---|
| `CODE_GENERATE_TRANSACTION_REQUIRED` | 101601 | 500 | Code generation must run inside a transaction |
| `CODE_GENERATE_WAREHOUSE_CODE_MISSING` | 101602 | 422 | Warehouse has no code to build the generated code from |
| `CODE_GENERATE_COUNT_INVALID` | 101603 | 500 | Number of codes to generate must be a positive integer |
| `CODE_GENERATE_WAREHOUSE_NO_EXHAUSTED` | 101604 | 422 | Barcodes support at most 999 warehouses |
| `CODE_GENERATE_BARCODE_EXHAUSTED` | 101605 | 422 | Barcode sequence of this warehouse is exhausted (max 9999999) |
| `CODE_RULE_NOT_FOUND` | 101606 | 404 | Code rule not found |
| `CODE_RULE_PREFIX_INVALID` | 101607 | 400 | prefix must be 2 uppercase letters/digits (BARCODE: exactly 2 digits) |
| `CODE_RULE_TYPE_INVALID` | 101608 | 400 | Unknown code type |
| `CODE_RULE_DESCRIPTION_INVALID` | 101609 | 400 | description must be a string of at most 255 characters |

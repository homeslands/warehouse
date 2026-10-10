# Đề xuất: API nhà cung cấp (WMS-14)

- Ngày: 2026-10-08
- Người viết: FE (warehouse-ui)
- Trạng thái: **chờ backend** — FE đã dùng hết API WMS-11 hiện có (danh sách, chi tiết, thêm, sửa, xoá, vật tư, giao dịch). Bảy việc dưới đây là phần FE chưa làm được hoặc phải chặn tạm.

Đối chiếu code `staging` và swagger sandbox ngày 2026-10-08 (`app/warehouse-api/src/supplier`).

> **Cập nhật 2026-10-08 (chiều)** — WMS-13 (PR #87/#88 vào `main`, `dev` qua PR #89, đã deploy sandbox) làm một phần
> mục 2.2 và **tạm ẩn API giao dịch**. FE đã thử với sandbox và bật `supplierSearch` + `supplierMaterialFilters`:
> - `GET /suppliers` nhận `search` (chứa chuỗi, OR trên `name` / `contactPerson` / `email`), `code` (khớp đúng, tự
>   viết hoa), `taxCode` (khớp đúng), `phonenumber` (chứa chuỗi) — ghép AND. FE dựng một ô tìm, đoán tham số
>   theo dạng nhập. `search` không khớp `code` → gõ một phần mã (`NCC`) không ra gì; nên gộp `code LIKE` vào `search`.
> - `sort` backend đang làm. FE gửi `sort[]=field:ASC|DESC` cho `code`, `name`, `taxCode`, `phonenumber`, `createdAt`,
>   sau cờ `supplierSort`. Sandbox hiện nhận `sort[]` (200) nhưng vẫn `createdAt DESC`.
> - `GET`/`POST /suppliers/{slug}/transactions` bị gỡ khỏi controller ("người dùng chưa được tự tạo giao dịch").
>   FE ẩn tab Giao dịch sau cờ `supplierTransactions` (tắt); mục 2.1, 2.5, 2.6 tạm hoãn theo.
> - `createdAt` / `updatedAt` của NCC và vật tư trả dạng `Date.toString()` (`"Thu Sep 24 2026 15:47:30 GMT+0700 (Indochina
>   Time)"`), không phải ISO 8601 như các module khác — FE vẫn đọc được nhưng nên trả ISO cho thống nhất.
> - **2026-10-09 (WMS-13-be 5–8)**: gắn / gỡ vật tư thành theo lô — `PUT`/`DELETE /suppliers/{slug}/materials`, body
>   `{ materialSlugs }` (1–100, 101222), tất cả hoặc không; route cũ `/:materialSlug` bị xoá. FE đã chuyển (chọn nhiều
>   ở hộp Gắn, tick nhiều dòng để Gỡ). **Đề nghị thêm:** khi từ chối cả lô (101212 / 100701 / 101213) trả kèm danh sách
>   slug gây lỗi (vd `details.materialSlugs`) — hiện người dùng chọn 20 vật tư mà lẫn 1 cái của NCC khác thì không biết
>   bỏ cái nào. Mục 2.3 (`GET /materials` trả `supplier`) vì vậy càng cần: FE ẩn sẵn được vật tư đã thuộc NCC khác.
> - `GET /suppliers/{slug}/materials` có thêm lọc `typeSlug`, `code`, `name`, `from`, `to` (mã lỗi 101221). FE dùng `code` /
>   `name` (một ô tìm) + `from` / `to` sau cờ `supplierMaterialFilters`; `typeSlug` chưa dùng (chưa có API danh sách loại
>   vật tư phía FE).

## 1. Tình trạng

| Chức năng | Backend | FE |
|---|---|---|
| `GET /suppliers`, `GET /suppliers/{slug}`, `POST`, `PATCH`, `DELETE` (xoá mềm) | ✅ WMS-11 | ✅ dùng thật — sửa chỉ gửi trường đã đổi |
| `GET` / `PUT` / `DELETE /suppliers/{slug}/materials[/{materialSlug}]` | ✅ WMS-11 | ✅ tab Vật tư: gắn / gỡ |
| `GET` / `POST /suppliers/{slug}/transactions` (lọc `type`, `materialSlug`, `from`, `to`) | ✅ WMS-11 | ✅ tab Giao dịch: ghi mua / trả / thanh toán, lọc |
| Mã lỗi 101201–101220 | ✅ WMS-11 | ✅ có bản dịch vi / en, lỗi về đúng ô |
| **Tổng hợp công nợ** | ❌ | chưa có — ngoài phạm vi đợt này |
| **`GET /suppliers` tìm / sắp xếp** | ⚠️ tìm có ở WMS-13 (`main`, chưa deploy); `sort` đang làm | ô tìm + sắp xếp dựng sẵn sau cờ `supplierSearch` / `supplierSort` (tắt) |
| **API giao dịch** | ⚠️ WMS-13 tạm ẩn `GET`/`POST .../transactions` | tab Giao dịch ẩn sau cờ `supplierTransactions` (tắt) |
| **`GET /materials` biết nhà cung cấp** | ❌ | ô gắn vật tư không ẩn được vật tư đã thuộc nhà cung cấp khác — báo 101212 tại ô |
| **`PATCH` nhận `null`** | ❌ `pickDefined` | ô trống = giữ nguyên |
| **Sửa giao dịch ghi sai** | ❌ sổ chỉ thêm | không có nút sửa / xoá giao dịch |
| **MANAGER ghi giao dịch** | ⚠️ chỉ ADMIN có `SUPPLIER_UPDATE` | MANAGER / SUPERVISOR chỉ xem |
| Swagger thiếu `page` / `size` | ⚠️ | FE tự biết (mọi endpoint danh sách) |

## 2. Việc backend còn phải làm

### 2.1. API tổng hợp công nợ một nhà cung cấp

**Hiện trạng.** `supplier-transaction.entity` chỉ lưu từng dòng (`type`, `quantity`, `unitPrice`, `amount`). Không có
endpoint nào cộng dồn; muốn biết còn nợ bao nhiêu phải kéo toàn bộ giao dịch về cộng.

**Tác động FE.** Trang chi tiết không hiện được "còn nợ". Tính ở client từ `GET .../transactions` là sai âm thầm: danh sách
phân trang, lọc theo loại / ngày, và FE không được phép coi một trang là toàn bộ sổ.

**Đề xuất.** `GET /suppliers/{slug}/summary` (`SUPPLIER_READ`), tham số tuỳ chọn `from`, `to` (ISO, theo `transactionDate`):

```json
{
  "message": "OK",
  "statusCode": 200,
  "result": {
    "totalPurchase": 12345678900,
    "totalReturn": 500000,
    "totalPayment": 10000000000,
    "balance": 1845178900
  }
}
```

`balance = totalPurchase − totalReturn − totalPayment` (tiền, tối đa 2 số lẻ, cùng kiểu với `amount`). Số dương = còn nợ
nhà cung cấp.

### 2.2. `GET /suppliers` — tìm và sắp xếp

**Hiện trạng.** `supplier.service` luôn `ORDER BY createdAt DESC`; `sort` được nhận nhưng bị bỏ qua; không có bộ lọc.

**Tác động FE.** `/suppliers` không có ô tìm, không sắp theo cột. Danh sách dài thì tìm một nhà cung cấp phải lật trang.
FE đã để sẵn cờ `supplierSearch` (`shared/api/backend-capabilities.ts`, mặc định `false`).

**Đề xuất.**

- `GET /suppliers?search=<chuỗi>` — khớp chứa (không phân biệt hoa thường) trên `name`, `code`, `taxCode`. Một tham số
  chung, như FE đang làm ở các màn khác khi backend chưa tách; nếu backend muốn tách `name` / `code` / `taxCode` thì báo
  FE chọn tham số theo dạng nhập (xem `pages/users/model/search-query.ts`).
- `sort` theo `field:ASC|DESC` (mảng, như `BaseQueryDto`) cho `name`, `code`, `createdAt`; không có `sort` thì giữ
  `createdAt DESC`.

### 2.3. `GET /materials` — cho biết nhà cung cấp của vật tư

**Hiện trạng.** `GET /materials` (lọc `code`, `name`, `typeSlug`) không trả gì về nhà cung cấp. Một vật tư chỉ thuộc một
nhà cung cấp (101212).

**Tác động FE.** Ô "Gắn vật tư" lấy 100 vật tư đầu, chỉ loại được vật tư đã gắn với **chính** nhà cung cấp này. Chọn
nhầm vật tư của nhà cung cấp khác thì chỉ biết sau khi bấm Gắn (101212 hiện dưới ô).

**Đề xuất.** Một trong hai (ưu tiên a):

- a. Mỗi phần tử trả thêm `supplier: { slug, code, name } | null`.
- b. Bộ lọc `hasSupplier=false` — chỉ trả vật tư chưa thuộc nhà cung cấp nào.

Kèm phân trang đúng và lọc `name` / `code` đã có, để FE chuyển ô chọn sang tìm phía server khi có màn Vật tư.

### 2.4. `PATCH /suppliers/{slug}` — xoá trống trường tuỳ chọn

**Hiện trạng.** `pickDefined` bỏ qua `undefined`; DTO `@IsOptional()` nên `null` / `''` hoặc bị bỏ, hoặc bị validate sai
(MST, SĐT, email có luật định dạng).

**Tác động FE.** Không xoá trống được `taxCode`, `phonenumber`, `email`, `address`, `contactPerson`, `note`. Form sửa coi
ô trống là "giữ nguyên" (có gợi ý dưới ô) và không bao giờ gửi `null` / `''`.

**Đề xuất.** `null` (hoặc `''` với `address`, `contactPerson`, `note`) = xoá trống; `undefined` = giữ nguyên. Không áp luật
định dạng cho `null`. `name` và `code` vẫn bắt buộc (101202, 101203).

```json
PATCH /suppliers/ncc-hn-01
{ "email": null, "note": "" }
```

### 2.5. Sửa giao dịch ghi sai

**Hiện trạng.** `POST /suppliers/{slug}/transactions` là API ghi duy nhất; không sửa, không xoá.

**Tác động FE.** Ghi nhầm số tiền hoặc vật tư thì không có đường lùi. FE đã hỏi xác nhận mọi lần ghi và ghi chú dưới tiêu đề
tab: "Giao dịch đã ghi không sửa hay xoá được."

**Đề xuất.** Giữ sổ chỉ thêm (đúng nguyên tắc sổ kế toán), thêm một trong hai:

- `type: 'ADJUSTMENT'` — dòng điều chỉnh, `amount` có thể âm, bắt buộc `note` (lý do), tuỳ chọn `refTransactionSlug`.
- `POST /suppliers/{slug}/transactions/{transactionSlug}/void` — huỷ có lý do (`{ "reason": "..." }`): giao dịch giữ
  nguyên, đánh dấu `voidedAt`, `voidedBy`, `voidReason`, và loại khỏi tổng công nợ (mục 2.1).

### 2.6. Nghiệp vụ: ai được ghi giao dịch

**Hiện trạng.** `POST .../transactions` cần `SUPPLIER_UPDATE`; trên sandbox chỉ ADMIN có mã này. MANAGER, SUPERVISOR chỉ có
`SUPPLIER_READ` + `MATERIAL_READ`.

**Tác động FE.** Ẩn nút "Ghi giao dịch" với hai vai trò này. Không có nhánh lùi theo vai trò: FE gác đúng theo authority.

**Cần chốt.** Quản lý kho có cần ghi giao dịch mua hàng không? Nếu có, nên tách mã riêng (vd `SUPPLIER_TRANSACTION_CREATE`)
thay vì cấp `SUPPLIER_UPDATE` (cũng cho sửa hồ sơ, gắn / gỡ vật tư). Báo FE mã mới để thêm vào `AUTHORITY_CODES`.

### 2.7. Swagger thiếu `page` / `size`

**Hiện trạng.** Mọi endpoint danh sách (`/suppliers`, `.../materials`, `.../transactions`) nhận `page` / `size` qua
`BaseQueryDto` nhưng swagger không khai.

**Tác động FE.** Không sinh được client từ swagger; FE đọc code backend. Không chặn việc gì.

**Đề xuất.** Khai `page`, `size`, `sort` trong `@ApiQuery` (hoặc `@ApiPropertyOptional` trên `BaseQueryDto`).

## 3. Thứ tự đề nghị

1. 2.3 và 2.2 — gỡ hai chỗ FE phải đoán hoặc chặn tạm.
2. 2.1 — công nợ là lý do chính của sổ giao dịch.
3. 2.4, 2.5, 2.6 — cần chốt nghiệp vụ trước khi làm.
4. 2.7 — làm cùng lúc với bất kỳ việc nào ở trên.

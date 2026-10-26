# Đề xuất: API phiếu xuất kho (gửi backend)

- Ngày: 2026-10-26 · Người đề xuất: FE (WMS-21)
- Liên quan: `app/warehouse-api/src/export-form/*`, `src/material-batch/*`, `src/inventory/*` (WMS-20, `origin/main`, đã
  chạy ở sandbox)
- Trạng thái: **chờ backend** — FE đã dùng đủ vòng đời phiếu xuất (danh sách, chi tiết, tạo / sửa / xoá nháp, gửi duyệt,
  xác nhận, huỷ, in). Sáu việc dưới đây là chỗ FE đang phải làm tạm hoặc chờ trả lời nghiệp vụ.

| # | Việc | FE đang làm tạm | Ưu tiên |
|---|---|---|---|
| 1 | Tìm vật tư trong kho theo mã / tên + lọc còn hàng | tải 500 vật tư đầu, lọc ở máy | cao |
| 2 | `purchaseOrder` bắt buộc với mọi lý do xuất | bắt nhập PO cho cả xuất huỷ / sản xuất / chuyển kho | cần PO trả lời |
| 3 | Lỗi thiếu hàng khi gửi duyệt không nói dòng nào | tải lại số khả dụng rồi tự đoán dòng | cao |
| 4 | Dòng phiếu xuất thiếu thông tin lô | nhãn lô chỉ có hạn dùng | thấp |
| 5 | Danh sách kho đích bị lọc theo phạm vi | thường chỉ thấy 0–1 kho, còn lại nhập tay | trung bình |
| 6 | Chuyển kho thật (kho đích + phiếu nhập tự động) | không làm — kho đích tự lập phiếu nhập | cần PO quyết |

## 1. `GET /warehouses/{slug}/materials`: tìm theo mã / tên và lọc còn hàng

**Hiện trạng.** `GetInventoryRequestDto` chỉ nhận `typeSlug`, `belowMinimum`, `aboveMaximum` (+ `page` / `size`). Không
tìm được theo mã / tên, không lọc được vật tư còn khả dụng.

**Tác động FE.** Form phiếu xuất tải **một trang `size: 500`** rồi lọc mã / tên ngay trên máy. Kho có > 500 vật tư thì
vật tư thứ 501 trở đi không chọn được — ô xổ và hộp "Chọn nhiều vật tư" ghi "Chỉ tìm trong 500 vật tư đầu của kho". Vật tư
hết hàng vẫn phải tải về rồi hiện mờ "Hết hàng".

**Đề xuất.** Thêm vào `GetInventoryRequestDto`, ghép AND với các bộ lọc cũ, cùng luật với `available-materials` của phiếu
nhập (để FE dùng chung hàm làm sạch `toMaterialSearchQuery`):

- `code` — khớp **đầu** mã vật tư, không phân biệt hoa thường (`A-Z 0-9 _ -`);
- `name` — khớp **đầu** tên vật tư, không phân biệt hoa thường;
- `inStock` (`true` / `false`) — `availableQuantity > 0` (= `quantity − reservedQuantity`).

```http
GET /warehouses/kho-a/materials?code=VT-0&inStock=true&page=1&size=50
```

```json
{
  "statusCode": 200,
  "message": "OK",
  "result": {
    "items": [
      {
        "slug": "inv-1",
        "materialSlug": "m-flour",
        "materialCode": "VT-01",
        "materialName": "Bột mì",
        "quantity": 120,
        "reservedQuantity": 20,
        "availableQuantity": 100,
        "baseUnit": { "slug": "u-kg", "code": "KG", "name": "Kilogram" },
        "units": [
          {
            "unitSlug": "u-kg",
            "unitCode": "KG",
            "unitName": "Kilogram",
            "conversionRate": 1,
            "isBaseUnit": true
          }
        ]
      }
    ],
    "page": 1,
    "pageSize": 50,
    "total": 1
  }
}
```

Khi có, FE chỉ đổi hàm gọi trong `features/export-form-editor/model/material-search.ts` sang tìm phía server (size 50,
debounce như phiếu nhập) — UI không đổi.

## 2. `purchaseOrder` có cần bắt buộc với mọi lý do xuất?

**Hiện trạng.** `CreateExportFormRequestDto.purchaseOrder` bắt buộc (`@IsNotEmpty`, ≤ 64) cho cả 5 lý do: Sản xuất, Xuất
huỷ, Chuyển kho, Bán, Khác.

**Tác động FE.** Ô "Số PO" bắt buộc ở bước ①. Với Xuất huỷ / Sản xuất / Chuyển kho thường không có PO, người dùng sẽ gõ
bừa ("0", "-") cho qua — dữ liệu PO mất ý nghĩa khi tìm theo Số PO.

**Câu hỏi cho PO.** Lý do nào thật sự cần PO? Đề xuất mặc định: chỉ **Bán** bắt buộc; các lý do khác không bắt buộc.

**Đề xuất BE (khi PO đồng ý).** `purchaseOrder` thành `@ValidateIf((o) => o.type === ExportFormType.Sale)` + `@IsOptional`
cho lý do khác; cột cho phép `NULL`; `ExportFormResponseDto.purchaseOrder: string | null`.

```json
{ "code": "PX-20261026-0830", "type": "DISPOSAL", "receiver": "Tổ huỷ hàng", "items": [ … ] }
```

FE đổi theo: ô Số PO chỉ bắt buộc khi lý do = Bán, dòng tóm tắt bước ② bỏ "· PO …" khi trống.

## 3. Lỗi thiếu hàng khi gửi duyệt: trả kèm vật tư / dòng

**Hiện trạng.** `POST /{slug}/submit` ném `INVENTORY_AVAILABLE_INSUFFICIENT` (100817) hoặc `MATERIAL_BATCH_INSUFFICIENT`
(101502), cả hai 409, body chỉ có `code` + `message`. `MaterialBatchService.reserve` và `InventoryService.reserve` đều
biết dòng nào thiếu ngay tại chỗ ném lỗi.

**Tác động FE.** FE không chỉ được dòng lỗi. Đang làm: tải lại số khả dụng (vật tư + lô) rồi chạy lại luật "vượt khả dụng"
ở máy để đánh dấu dòng; không ra dòng nào (FEFO thiếu vì cộng nhiều lô, người khác vừa giữ chỗ) thì chỉ báo chung "Không đủ
hàng để gửi duyệt" và đưa về bước ②. Hai request thừa, và có lúc người dùng không biết sửa dòng nào.

**Đề xuất.** Giữ nguyên `statusCode` / `code`, thêm `details` (mảng, vì một lần gửi có thể thiếu nhiều dòng; dừng ở dòng đầu
cũng được — khi đó mảng 1 phần tử):

```json
{
  "statusCode": 409,
  "code": 101502,
  "message": "Material batch insufficient",
  "timestamp": "2026-10-26T02:00:00.000Z",
  "path": "/api/v1/warehouses/kho-a/export-forms/xf-1/submit",
  "method": "POST",
  "details": [
    {
      "lineNo": 2,
      "materialSlug": "m-flour",
      "batchSlug": "b-1",
      "requestedBaseQuantity": 240,
      "availableBaseQuantity": 180
    }
  ]
}
```

`lineNo` là số dòng **trước khi tách lô** (thứ tự FE gửi). Với 100817 bỏ `batchSlug`. FE đổi theo: đánh dấu đúng dòng
"Chỉ còn 180 KG khả dụng" từ `details`, không tải lại nữa.

## 4. Dòng phiếu xuất: thêm ngày nhập và mã phiếu nhập của lô

**Hiện trạng.** `ExportFormItemResponseDto` chỉ có `batchSlug` + `batchExpiryDate`.

**Tác động FE.** Trang chi tiết và bản in chỉ ghi được "HSD 30/11/2026" hoặc "Lô không hạn". Hai lô cùng hạn (hoặc cùng
không hạn) của một vật tư — chuyện thường khi BE tách một dòng theo FEFO — trông giống hệt nhau; thủ kho không biết lấy
hàng của lần nhập nào. FE cố ý **không** gọi thêm `GET material-batches` ở trang chi tiết / bản in (thêm request, và lô đã
hết hàng không còn trong danh sách `status=1`).

**Đề xuất.** Snapshot thêm hai trường lúc gán lô (như `unitCode`):

```json
{
  "lineNo": 1,
  "materialCode": "VT-01",
  "batchSlug": "b-1",
  "batchExpiryDate": "2026-11-30",
  "batchEntryDate": "2026-09-02",
  "batchImportFormCode": "PN-20260902-0815",
  "quantity": 10,
  "baseQuantity": 10
}
```

FE đổi theo: cột Lô ghi "HSD 30/11/2026 · Nhập 02/09/2026 · PN-20260902-0815".

## 5. Danh sách kho đích cho Chuyển kho

**Hiện trạng.** `GET /warehouses` lọc theo phạm vi (MANAGER / SUPERVISOR chỉ thấy kho mình quản lý hoặc là thành viên,
`WMS-10-be(7)`). Phiếu Chuyển kho cần chọn **kho nhận** — thường là kho người lập không thuộc.

**Tác động FE.** Ô "Kho nhận" thường chỉ có 0–1 kho; còn lại người dùng phải chọn "Kho khác — nhập tên" và gõ tay, nên
`receiver` không thống nhất (`Kho: KHO-B · Kho B` so với "kho b", "Kho Bình Dương"…). Thiếu `WAREHOUSE_READ` thì chỉ có ô chữ.

**Đề xuất.** Một endpoint nhẹ, không lọc phạm vi, chỉ trả mã + tên kho đang hoạt động, gác bằng quyền tạo phiếu xuất
(không cần `WAREHOUSE_READ`):

```http
GET /warehouses/options?isActive=true
```

```json
{
  "statusCode": 200,
  "message": "OK",
  "result": [
    { "slug": "kho-a", "code": "KHO-A", "name": "Kho A" },
    { "slug": "kho-b", "code": "KHO-B", "name": "Kho Bình Dương" }
  ]
}
```

FE đổi theo: ô Kho nhận dùng endpoint này cho mọi người có `EXPORT_FORM_CREATE`; vẫn giữ "Kho khác — nhập tên".

## 6. (Tuỳ PO) Chuyển kho thật

**Hiện trạng.** Chuyển kho chỉ là một lý do xuất; kho nhận nằm trong chuỗi `receiver`. Kho nhận phải tự lập phiếu nhập —
không có liên kết giữa hai phiếu, dễ lệch số lượng hoặc quên nhập.

**Câu hỏi cho PO.** Có cần chuyển kho "một chạm" không? Nếu có:

- `CreateExportFormRequestDto` thêm `targetWarehouseSlug` (bắt buộc khi `type = TRANSFER`, khác kho hiện tại);
- xác nhận phiếu xuất Chuyển kho → tự tạo phiếu nhập **Nháp** ở kho đích, cùng dòng / đơn vị / số lượng, có
  `sourceExportFormSlug`;
- `ExportFormResponseDto` trả `targetWarehouse: { slug, code, name } | null` và `transferImportFormSlug: string | null`.

```json
{
  "code": "PX-20261026-0830",
  "type": "TRANSFER",
  "targetWarehouseSlug": "kho-b",
  "receiver": "Kho: KHO-B · Kho Bình Dương",
  "purchaseOrder": "PO-12",
  "items": [{ "materialSlug": "m-flour", "unitSlug": "u-kg", "quantity": 10, "unitPrice": 0 }]
}
```

Chưa có quyết định thì FE giữ như hiện tại (không làm gì thêm ở kho đích).

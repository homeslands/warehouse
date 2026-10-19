# Đề xuất: API upload file và phiếu nhập (gửi backend)

- Ngày: 2026-10-13 · Người đề xuất: FE (WMS-17)
- Liên quan: `app/warehouse-api/src/file/*`, `app/warehouse-api/src/import-form/*`

## 1. `POST /file/upload` trả key trong `result`

Hiện tại: `result` vắng, key chỉ nằm trong `message` ("File <key> uploaded to S3 successfully"). FE phải bóc bằng regex
(`shared/api/file.api.ts`) — đổi câu message là hỏng upload.

Đề xuất: `result: { key: string }` (giữ `message` như cũ).

## 2. Endpoint lấy link tải file

Bucket S3 không public, không có endpoint tải về → trang chi tiết phiếu chỉ hiện tên file. Đề xuất
`GET /file/download-url?key=…` trả presigned URL ngắn hạn (vd 5 phút), gác theo quyền đọc tài nguyên chứa file.

## 3. Key file hỏng với tên nhiều dấu chấm / không có đuôi

`S3Service.uploadFile` lấy `originalname.split('.')[0]` và `[1]`: `bao.gia.v2.pdf` → `bao-<ts>.gia`; `README` →
`README-<ts>.undefined`; `replace(' ', '-')` chỉ thay khoảng trắng đầu tiên. Đề xuất tách đuôi bằng `path.extname` và thay
mọi khoảng trắng.

## 4. Lỗi theo dòng của phiếu nhập kèm chỉ số dòng

101319–101328 không cho biết dòng nào → FE chỉ toast được. Đề xuất thêm `itemIndex` (0-based, theo thứ tự gửi) vào body lỗi.

## 5. Lọc danh sách phiếu nhập

`GET /warehouses/:w/import-forms` mới lọc `status`. Đề xuất thêm `code` (chứa chuỗi) và `dateFrom` / `dateTo`.

## 6. Mã đơn vị gốc trên dòng phiếu

`ImportFormItemResponseDto` không có đơn vị gốc của vật tư → FE không ghi được "= 250 KG" khi phiếu không có dòng 1:1.
Đề xuất thêm `baseUnitCode` (snapshot như `unitCode`).

# WMS-17 FE — Vật tư trong kho: checklist test tay

Môi trường: `VITE_API_PROXY_TARGET=https://sandbox.warehouse.cmsiot.net`, `npm run dev`. Ba tài khoản: ADMIN,
MANAGER, SUPERVISOR (thuộc ít nhất 1 kho). Mặc định chỉ ADMIN có quyền thêm / gỡ vật tư (xem CLAUDE.md → Nợ kỹ thuật →
ma trận quyền seed).

## Tab và bảng (ADMIN)

- [ ] Vào chi tiết kho → tab "Vật tư" mặc định; đổi sang tab thành viên → URL `?tab=members`; F5 giữ tab.
- [ ] Bảng hiện tồn, giữ chỗ, còn xuất, ngưỡng min / max; nhãn "Dưới min" / "Trên max" đúng chỗ; ngưỡng chưa đặt hiện "Chưa đặt".
- [ ] Vật tư có đơn vị gốc hiện kèm đơn vị; chưa có thì không kèm (trường BE là `baseUnit.code`). Ngưỡng hiển thị dạng "20 – 70 KG" (tối thiểu – tối đa + mã đơn vị gốc); `baseUnit: null` thì chỉ hiện số, không kèm đơn vị.

## Lọc

- [ ] Lọc theo loại vật tư; lọc cảnh báo (dưới min / trên max).
- [ ] "Xoá bộ lọc" đưa bảng về đủ dòng và về trang 1.
- [ ] Câu báo trống hai kiểu: kho chưa có vật tư nào / bộ lọc không có kết quả.

## Sheet lịch sử

- [ ] Bấm dòng → sheet lịch sử mở, URL có `?material=`.
- [ ] Gửi link `?material=` cho người khác (hoặc tab ẩn danh) → mở đúng vật tư (không hiện ngưỡng).
- [ ] Vật tư đã bị gỡ khỏi kho, mở bằng link → câu báo thay vì lỗi trắng.
- [ ] "Xem thêm" nạp trang tiếp theo của lịch sử.
- [ ] Ghi chú của phiếu nhập hiện "Phiếu nhập X" (không phải "Import form X").
- [ ] Dòng lịch sử không có người thao tác → hiện "Người dùng".

## Thêm vật tư

- [ ] Gắn vật tư có sẵn trong danh mục → hộp đóng, bảng tự tải lại, vật tư xuất hiện.
- [ ] Tạo vật tư mới (mã, tên, loại, đơn vị gốc) + chọn NCC → vật tư vào bảng; NCC được gắn.
- [ ] Vật tư đã ở kho không còn hiện trong danh mục của hộp.

## Gỡ vật tư

- [ ] Vật tư còn tồn hoặc còn giữ chỗ → mục Gỡ khoá, có dòng lý do.
- [ ] Vật tư tồn 0 → gỡ được (có hộp xác nhận), bảng tự tải lại.
- [ ] Hai tab cùng gỡ một vật tư → tab sau báo "đã được gỡ trước đó".

## Kho ngừng hoạt động

- [ ] Nút Thêm khoá, có dòng lý do.
- [ ] Bấm Gỡ → toast lỗi 100804.

## Phân quyền

- [ ] MANAGER / SUPERVISOR (seed mặc định): thấy tab và bảng, không có Thêm / Gỡ.

## Phiếu nhập

- [ ] "＋ Thêm vật tư vào kho…" ở ô chọn vật tư vẫn chạy như cũ: câu mô tả cũ, dòng được chọn ngay sau khi gắn / tạo.

## Khi BE deploy tìm kiếm

- [ ] Bật cờ `inventorySearch` ở `shared/api/backend-capabilities.ts`: tìm theo mã / tên cho kết quả đúng.

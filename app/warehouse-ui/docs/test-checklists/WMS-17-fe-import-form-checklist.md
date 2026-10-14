# WMS-17 FE — Phiếu nhập kho: checklist test tay

Môi trường: `VITE_API_PROXY_TARGET=https://sandbox.warehouse.cmsiot.net`, `npm run dev`. Ba tài khoản: ADMIN,
MANAGER, SUPERVISOR (thuộc ít nhất 1 kho). Bật cho MANAGER ở `/permissions`: `IMPORT_FORM_CREATE`,
`IMPORT_FORM_UPDATE_DRAFT` (xem CLAUDE.md → Nợ kỹ thuật → ma trận quyền seed).

## Danh sách
- [ ] Vào menu "Phiếu nhập" → tự chọn kho, URL có `?warehouse=`; F5 giữ kho; copy link sang tab ẩn danh mở đúng kho.
- [ ] Đổi kho → về trang 1; lọc trạng thái; xoá bộ lọc.
- [ ] Kho ngừng hoạt động → nút Tạo khoá, có dòng lý do.
- [ ] Tài khoản không thuộc kho nào → câu "Bạn chưa thuộc kho nào…".

## Tạo
- [ ] Mã gợi ý `PN-YYYYMMDD-HHmm`; sửa thành mã trùng → lỗi tại ô Mã phiếu.
- [ ] Chọn vật tư → đơn vị gốc, "Tồn: …"; đổi sang đơn vị quy đổi → "= … <đv gốc>"; đổi vật tư → đơn vị về gốc.
- [ ] Hai dòng cùng vật tư + đơn vị → lỗi ở dòng 2; khác đơn vị → được.
- [ ] Thành tiền / tổng đúng với số lẻ (0,1 × 3 = 0,3).
- [ ] Đính kèm file < 10 MB → hiện tên; > 10 MB → lỗi; gỡ file.
- [ ] Lưu nháp → hộp xác nhận (mã, số dòng, tổng) → sang trang chi tiết.
- [ ] Đang nhập dở bấm menu khác → hỏi "Bỏ thay đổi chưa lưu?"; đóng tab → hộp của trình duyệt.

## Sửa / Xoá
- [ ] SUPERVISOR: phiếu mình sửa / xoá được; phiếu người khác không thấy nút.
- [ ] Hai tab cùng sửa một phiếu: tab lưu sau → toast "vừa bị người khác thay đổi", về chi tiết với dữ liệu mới.
- [ ] Gỡ file / xoá ghi chú rồi lưu → giá trị cũ mất thật (F5 kiểm lại).
- [ ] Xoá nháp → về danh sách; tạo lại mã vừa xoá → lỗi "mã đã dùng cho một phiếu đã xoá".

## Xác nhận / Huỷ
- [ ] MANAGER xác nhận → trạng thái Đã xác nhận, người xác nhận đúng; tồn vật tư tăng đúng `baseQuantity` (xem lịch sử tồn ở swagger).
- [ ] Huỷ → Đã huỷ, tồn không đổi, hiện "Người huỷ".
- [ ] Phiếu Đã xác nhận / Đã huỷ: không còn Sửa / Xoá / Xác nhận / Huỷ, kể cả ADMIN.

## In
- [ ] In phiếu Đã xác nhận: chỉ có khung phiếu (không sidebar / header), bảng dòng, ô ký.
- [ ] In phiếu Nháp / Đã huỷ: có nhãn "… — chưa có giá trị nhập kho".

## Giao diện
- [ ] Chrome 320 / 768 / 1024 / 1400px, sidebar mở / thu gọn: chân trang form không đè nội dung, không cuộn ngang trang.
- [ ] Dark mode; tiếng Anh.

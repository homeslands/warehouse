# WMS-17 FE — Phiếu nhập kho: checklist test tay

Môi trường: `VITE_API_PROXY_TARGET=https://sandbox.warehouse.cmsiot.net`, `npm run dev`. Ba tài khoản: ADMIN,
MANAGER, SUPERVISOR (thuộc ít nhất 1 kho). Bật cho MANAGER ở `/permissions`: `IMPORT_FORM_CREATE`,
`IMPORT_FORM_UPDATE_DRAFT` (xem CLAUDE.md → Nợ kỹ thuật → ma trận quyền seed).

## Danh sách

- [ ] Vào menu "Phiếu nhập" → tự chọn kho, URL có `?warehouse=`; F5 giữ kho; copy link sang tab ẩn danh mở đúng kho.
- [ ] Đổi kho → về trang 1; lọc trạng thái; xoá bộ lọc.
- [ ] Kho ngừng hoạt động → nút Tạo khoá, có dòng lý do.
- [ ] Tài khoản không thuộc kho nào → câu "Bạn chưa thuộc kho nào…".

## Tạo (sheet rộng mở ngay trên danh sách)

- [ ] Bấm "Tạo phiếu" → sheet rộng ~1024px (full width dưới 640px), tiêu đề "Tạo phiếu nhập · <kho>", chân sheet: Tổng bên trái, Huỷ / Lưu nháp bên phải; URL không đổi.
- [ ] Mã gợi ý `PN-YYYYMMDD-HHmm`; sửa thành mã trùng → lỗi tại ô Mã phiếu.
- [ ] Chọn vật tư → đơn vị gốc, "Tồn: …"; đổi sang đơn vị quy đổi → "= … <đv gốc>"; đổi vật tư → đơn vị về gốc.
- [ ] Hai dòng cùng vật tư + đơn vị → lỗi ở dòng 2; khác đơn vị → được.
- [ ] Thành tiền / tổng đúng với số lẻ (0,1 × 3 = 0,3).
- [ ] Đính kèm file < 10 MB → hiện tên; > 10 MB → lỗi; gỡ file.
- [ ] Lưu nháp → hộp xác nhận (mã, số dòng, tổng) → sheet đóng, ở lại danh sách, phiếu mới nằm đầu bảng.
- [ ] Đang nhập dở bấm Huỷ / × / Esc / bấm ra ngoài → hỏi "Bỏ thay đổi chưa lưu?"; đóng / F5 tab → hộp của trình duyệt. Mở lại sheet → form trống. (F5 / Back khi sheet đang mở làm mất phần đang nhập, như mọi sheet khác — không có URL riêng cho form.)

## Sửa / Xoá

- [ ] "Sửa" (menu ⋯ ở danh sách, nút ở trang chi tiết) → sheet sửa tự tải chi tiết (có khung chờ), lưu xong sheet đóng và ở lại đúng trang; Lưu nháp khoá khi chưa đổi gì.
- [ ] SUPERVISOR: phiếu mình sửa / xoá được; phiếu người khác không thấy nút.
- [ ] Hai tab cùng sửa một phiếu: tab lưu sau → toast "vừa bị người khác thay đổi", sheet đóng, danh sách / chi tiết tải lại dữ liệu mới.
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

## Thêm vật tư vào kho từ phiếu
- [ ] Mở ô vật tư của một dòng, gõ tên vật tư chưa có ở kho → cuối danh sách có "＋ Thêm vật tư vào kho…" → hộp mở, ô tìm có sẵn chữ.
- [ ] Vật tư có trong danh mục → "Gắn vào kho" → hộp đóng, dòng đó được chọn vật tư + đơn vị gốc, có hiện "Tồn: 0 …".
- [ ] Tạo vật tư mới (mã, tên, loại, đơn vị gốc) không chọn NCC → dòng được chọn; mở màn Vật tư thấy vật tư mới.
- [ ] Tạo vật tư mới có chọn NCC → dòng phiếu sau khi lưu có NCC đó.
- [ ] Mã trùng → lỗi tại ô Mã trong hộp.
- [ ] Đăng nhập MANAGER (seed mặc định) → vẫn tìm được, nút "Gắn vào kho" / "Tạo và gắn vào kho" khoá kèm lý do.
- [ ] Bỏ phiếu sau khi gắn → vật tư vẫn ở kho (màn tạo phiếu mới thấy vật tư trong ô chọn).

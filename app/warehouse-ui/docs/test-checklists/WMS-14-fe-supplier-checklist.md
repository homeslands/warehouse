# Checklist test tay — WMS-14 Quản lý nhà cung cấp

Môi trường: sandbox. Tài khoản: root / `0310000000` (ADMIN) / `0340000000` (MANAGER) / `0330000000` (SUPERVISOR) —
mật khẩu hỏi trưởng nhóm, không ghi vào repo. Dữ liệu test đặt tên `ZZ Test …` (mã `ZZ-TEST-01`…) để dọn sau.

## Truy cập theo vai trò

- [ ] ADMIN / root: thấy mục "Nhà cung cấp"; có nút "Thêm nhà cung cấp"; ở chi tiết có Sửa, Xoá, "Gắn vật tư", "Ghi giao dịch", "Gỡ".
- [ ] MANAGER: xem được danh sách, chi tiết, hai tab; KHÔNG có nút Thêm / Sửa / Xoá / Gắn vật tư / Gỡ / Ghi giao dịch.
- [ ] SUPERVISOR: như MANAGER (chỉ xem).
- [ ] Người thiếu `MATERIAL_READ` mở `?tab=materials` → rơi về tab Giao dịch, không trang trắng. Gõ `?tab=abc` → về tab hợp lệ.
- [ ] Cờ `supplierTransactions` tắt (mặc định, WMS-13 ẩn API giao dịch): không có tab "Giao dịch", không nút "Ghi giao dịch"; `?tab=transactions` → tab Vật tư; người thiếu `MATERIAL_READ` chỉ thấy thẻ hồ sơ.
- [ ] Người không có `SUPPLIER_READ` gõ `/suppliers` → trang 403.

## Danh sách

- [ ] Mới nhất ở đầu (`createdAt` giảm dần); có ô tìm (cờ `supplierSearch` bật); chưa có mũi tên sắp xếp trên tiêu đề cột (`supplierSort` tắt).
- [ ] Mobile 375px: ô tìm và nút ＋ cùng một hàng.

### Tìm (`supplierSearch` — đã bật 2026-10-08)

- [ ] Gõ tên / người liên hệ / email (vd `Công ty`, `sales@`) → request có `search=…`, chỉ một tham số tìm.
- [ ] Gõ mã có số hoặc gạch nối (`ncc-hn-01`) → `code=NCC-HN-01` (khớp đúng — `NCC-HN` không ra `NCC-HN-01`, câu báo trống nói "mã phải nhập đủ").
- [ ] Gõ `0101234567-001` hoặc `0101234567001` → `taxCode=0101234567-001`. Gõ `0101234567` → `taxCode`.
- [ ] Gõ `0912 345 678` / `0912.345.678` → `phonenumber=0912345678`; gõ `0241` → `phonenumber=0241` (chứa chuỗi).
- [ ] Gõ MST TP.HCM `03…` (10 số) → bị đoán là SĐT, trống → câu báo nêu "số điện thoại" + nút "Tìm theo mã số thuế" → ra đúng NCC; URL có `searchBy=taxCode`; gõ lại ô tìm thì `searchBy` mất.
- [ ] Mobile 375px: câu báo trống dài xuống hàng, bảng không tràn ngang.

### Lọc tab Vật tư (`supplierMaterialFilters` — đã bật 2026-10-08)

- [ ] Gõ `nl04` → request `code=NL04`; gõ `xi măng` → `name=xi măng`; đang ở trang 2 thì về trang 1.
- [ ] Chọn khoảng "Ngày tạo vật tư" → `from` 00:00 ngày đầu, `to` 23:59:59.999 ngày cuối (giờ máy, gửi ISO); chỉ ra vật tư có cột Ngày tạo trong khoảng.
- [ ] Không ra kết quả: tìm mã → câu nêu mã + "mã phải nhập đủ"; tìm tên → câu nêu tên; có lọc ngày → "Không có kết quả".
- [ ] Gắn / gỡ khi đang lọc → bảng tải lại đúng bộ lọc; số trên tab "Vật tư (n)" vẫn là tổng không lọc, khoá Xoá NCC theo tổng không lọc.
- [ ] Chuyển sang tab khác rồi quay lại → bộ lọc tab Vật tư về trống (không lên URL).

### Khi bật `supplierSort` (backend đã làm sort)

- [ ] Bấm tiêu đề Mã / Tên / MST / SĐT / Ngày tạo → `sort[]=field:ASC`, bấm lần hai → `DESC`; dữ liệu đổi thứ tự thật. Người liên hệ / email / địa chỉ không bấm được.
- [ ] Tên, địa chỉ, người liên hệ dài xuống dòng trong ô, không làm bảng tràn ngang; email dài không đẩy cột khác.
- [ ] Ô trống (MST, SĐT, email…) hiện dấu "—", không chữ `null`.
- [ ] Chuyển trang / đổi số dòng hoạt động; danh sách rỗng hiện câu báo trống, không bảng trống.
- [ ] Bấm dòng / tên → sang trang chi tiết `/suppliers/<slug>`.

## Thêm nhà cung cấp (ADMIN)

- [ ] Bấm "Thêm" khi trống → lỗi ở mọi ô bắt buộc (tên, mã) cùng lúc.
- [ ] Gõ mã `ncc-test-01` → khi lưu mã thành `NCC-TEST-01` (tự viết hoa). Mã có dấu cách / ký tự lạ → lỗi tại ô.
- [ ] MST `123` → lỗi; `0123456789` và `0123456789-001` qua. SĐT `0123` → lỗi; email `abc` → "Email không hợp lệ".
- [ ] Ghi chú quá 1.000 ký tự → lỗi tại ô.
- [ ] Bấm Lưu → hộp xác nhận "Thêm nhà cung cấp mới?" tóm tắt đúng dữ liệu; Quay lại thì form còn nguyên; Xác nhận mới gửi.
- [ ] Mã đã tồn tại → lỗi 101205 ngay dưới ô Mã, sheet vẫn mở. MST trùng → 101208 dưới ô MST.
- [ ] Đóng sheet khi đã gõ dở → hỏi "Bỏ thay đổi?". Thành công → toast, sheet đóng, mới nhất ở đầu danh sách; mở lại → form trống.

## Sửa (ADMIN)

- [ ] Mở form sửa → các ô điền sẵn (gồm cả Mã).
- [ ] Chỉ đổi tên → Network `PATCH` chỉ có `name`, không gửi trường khác.
- [ ] Xoá trống email / địa chỉ / ghi chú rồi lưu → KHÔNG gửi trường đó (không `null`, không `''`); giá trị cũ giữ nguyên, ô có gợi ý "để trống = giữ nguyên".
- [ ] Chưa đổi gì → nút Lưu khoá.

## Xoá (ADMIN)

- [ ] NCC còn vật tư: mục Xoá ở chi tiết bị khoá, chỉ có tooltip (`title`) nêu lý do — KHÔNG có link; link sang tab Vật tư chỉ xuất hiện trong hộp xoá khi backend trả 101211.
- [ ] Gỡ hết vật tư → nút Xoá mở khoá; xoá được → về danh sách, toast, NCC biến mất.
- [ ] Tạo lại NCC với mã vừa xoá → lỗi 101206 (mã bị giữ chỗ) dưới ô Mã.
- [ ] Mở link `/suppliers/<slug đã xoá>` → trang không tìm thấy (101201), không trắng.

## Tab Vật tư

- [ ] Cột Mã · Tên · Loại · Đơn vị cơ sở · Thao tác (Gỡ); NCC chưa có vật tư hiện "Nhà cung cấp chưa có vật tư nào."
- [ ] "Gắn vật tư": ô chọn lọc theo gõ, nhãn `Mã · Tên · ĐVT`; vật tư đã gắn với NCC này không còn trong ô.
- [ ] Chọn vật tư đang thuộc NCC khác → bấm Gắn → lỗi 101212 "Vật tư này đã thuộc nhà cung cấp khác" ngay dưới ô.
- [ ] Gắn thành công → toast, bảng có thêm dòng, số trên tab tăng, nút Xoá của NCC khoá, ô chọn vật tư trong form giao dịch có vật tư mới.
- [ ] "Gỡ" → hộp xác nhận nêu mã vật tư + mã NCC, nói rõ lịch sử giao dịch giữ nguyên; gỡ dòng cuối của trang → bảng lùi về trang trước.

## Tab Giao dịch

- [ ] Có dòng "Giao dịch đã ghi không sửa hay xoá được."; mới nhất ở đầu.
- [ ] Ghi MUA HÀNG: chọn vật tư, SL, đơn giá → "Thành tiền (tạm tính)" đúng; `0.1 × 3` hiện `0,3`. SL 7 số lẻ, đơn giá 3 số lẻ bị chặn tại ô.
- [ ] Ghi TRẢ HÀNG: như mua hàng. NCC chưa gắn vật tư → câu "Hãy gắn vật tư trước" + link sang tab Vật tư, nút Ghi khoá.
- [ ] Ghi THANH TOÁN: chỉ có ô Số tiền (không vật tư / SL / đơn giá). Đổi loại Mua → Thanh toán sau khi đã nhập SL → Network `POST` KHÔNG mang `materialSlug`/`quantity`/`unitPrice`; đổi Thanh toán → Mua thì không mang `amount`.
- [ ] Ngày giao dịch: không chọn được ngày tương lai; hôm nay → giờ hiện tại; ngày quá khứ → Network gửi 12:00 trưa ngày đó.
- [ ] Bấm Ghi → hộp xác nhận "Ghi giao dịch này?" (luôn hiện) tóm tắt Loại · Vật tư · SL × Đơn giá · Thành tiền · Ngày. Thành công → toast, sheet đóng, dòng mới ở đầu.
- [ ] Số tiền lớn (vd `12345678900`) hiện `12.345.678.900 ₫`, căn phải, không tràn cột. Ghi chú dài cắt `…`, rê chuột thấy đủ (`title`).
- [ ] Lọc Loại → chỉ còn đúng loại; lọc Vật tư → chỉ còn vật tư đó; URL giữ bộ lọc, F5 không mất.
- [ ] Lọc khoảng ngày 01/10 – 07/10 → Network `from` = 01/10 00:00:00.000, `to` = 07/10 23:59:59.999 (giờ máy); giao dịch ghi lúc 22:00 ngày 07/10 CÓ trong kết quả.
- [ ] Có bộ lọc đang bật thì hiện số bộ lọc + nút xoá lọc; không có kết quả → câu báo trống phân biệt: chưa lọc gì thì "Chưa có giao dịch nào."; đang lọc thì "Không có kết quả." (chuỗi `common:noResults`).
- [ ] Giao dịch cũ của vật tư đã gỡ vẫn hiện đúng mã · tên vật tư.

## Mobile

- [ ] 320px / 375px: bộ lọc gom thành chip; bảng ẩn cột phụ (Người ghi, Ghi chú…), còn cột chính và Thao tác; không có thanh cuộn ngang của trang.
- [ ] Sheet tạo / ghi giao dịch và hộp xác nhận nằm gọn trong màn hình, nút không bị cắt, cuộn được khi nội dung dài.

## Đa ngôn ngữ / giao diện

- [ ] Đổi sang English: mọi nhãn, lỗi 101201–101220, toast, hộp xác nhận đều tiếng Anh.
- [ ] Dark mode: chấm loại giao dịch (xanh lá / cam / xanh dương), chip, hộp xác nhận đọc rõ, không chữ chìm vào nền.

## Dọn dẹp

- [ ] Gỡ vật tư rồi xoá mọi NCC `ZZ Test …` (mã đã xoá vẫn bị giữ chỗ — dùng mã mới cho lần test sau).

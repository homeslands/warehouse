# Checklist test tay — WMS-15 Vật tư, Loại vật tư, Đơn vị

Môi trường: sandbox. Tài khoản cần đủ `MATERIAL_*` + `UNIT_*` (ADMIN) và một tài khoản chỉ có quyền đọc (MANAGER) —
mật khẩu hỏi trưởng nhóm, không ghi vào repo. Dữ liệu thử đặt tên bắt đầu bằng `ZZ Test` để dọn sau.

## Đơn vị `/units`

- [ ] Tạo `ZZ Test kg` mã `zzkg` → hộp xác nhận hiện mã `ZZKG` → tạo xong có trong bảng, cột "Đang dùng" = 0.
- [ ] Tạo mã 1 ký tự (`Z`) được; mã `ZZ-` báo "không đúng định dạng" tại ô Mã.
- [ ] Tạo trùng mã → "Mã đơn vị đã tồn tại" tại ô Mã.
- [ ] Sửa: xoá trống mô tả → lưu → mô tả thành "Chưa có".
- [ ] Ô tìm: gõ `ZZKG` → Network gửi `code`; gõ `zz test` → gửi `name`; trống thì có nút "Tìm theo mã / tên" đổi được.
- [ ] Đơn vị đang dùng: mục Xoá bị khoá, có dòng lý do; di chuột lên số "Đang dùng" thấy phần tách gốc / quy đổi đúng.
- [ ] Đơn vị chưa dùng xoá được.

## Loại vật tư `/material-types`

- [ ] Tạo / sửa / tìm như Đơn vị; mã 1 ký tự bị từ chối.
- [ ] Xoá loại còn vật tư → hộp giữ mở, báo lỗi trong hộp; đóng rồi mở lại → không còn câu lỗi cũ.

## Vật tư `/materials`

- [ ] Tạo `ZZ Test xi măng` với loại + đơn vị gốc `ZZKG`; tối thiểu 10, tối đa 5 → lỗi tại ô Tồn tối đa.
- [ ] Gõ `1,5` vào Tồn tối đa → rời ô vẫn `1,5`, lưu thành 1,5; gõ `1.000` → rời ô thành `1`; gõ `0.1234567` → báo lỗi;
      gõ `1000000000000` → "Số quá lớn".
- [ ] Lọc Loại vật tư + ô tìm cùng lúc → kết quả khớp cả hai; trống có câu "trong loại đang lọc" + nút đổi cách tìm;
      "Xoá bộ lọc" bỏ lọc loại.
- [ ] Bấm hàng → trang chi tiết; nút "Quay lại danh sách" về đúng trang / bộ lọc cũ.
- [ ] Chi tiết: thẻ Tổng quan đúng; bảng quy đổi có dòng gốc kèm badge "Đơn vị gốc", không có thao tác.
- [ ] Thêm đơn vị quy đổi (vd bao = 50) → dòng "1 BAO = 50 ZZKG"; cột "Đang dùng" của đơn vị bao tăng.
- [ ] Mở hộp thêm, đóng, mở lại → không còn lựa chọn / lỗi cũ.
- [ ] Sửa tỉ lệ → chưa đổi thì khoá Lưu; đổi → lưu được.
- [ ] Gỡ đơn vị quy đổi → hộp xác nhận → mất khỏi bảng, lại có trong danh sách gắn được.
- [ ] Đã gắn đơn vị quy đổi → sửa vật tư đổi đơn vị gốc → lỗi "Không đổi được đơn vị gốc…" tại ô.
- [ ] Xoá vật tư đã gán vào kho → báo trong hộp; vật tư chưa gán → xoá xong về danh sách.
- [ ] Xoá vật tư từ màn danh sách rồi bấm Back / Forward về trang chi tiết của nó → báo "Không tìm thấy vật tư".
- [ ] Vật tư cũ chưa có đơn vị gốc (nếu sandbox còn): danh sách hiện "Chưa có"; trang chi tiết có câu nhắc thay bảng
      quy đổi; sửa vật tư → gợi ý "Đơn vị lưu tồn kho…", bắt buộc chọn; chọn xong → bảng quy đổi hiện ra.
- [ ] Loại / đơn vị gốc đang gán nằm ngoài 100 bản ghi đầu (khi sandbox có > 100) → form sửa vẫn hiện đúng giá trị.
- [ ] Mở form sửa vật tư A, đóng, mở form sửa vật tư B → form là dữ liệu của B, không lẫn của A.
- [ ] Hộp thêm đơn vị quy đổi khi đã gắn hết đơn vị → ô ghi "Không còn đơn vị nào để thêm", nút Lưu khoá.
- [ ] Bảng quy đổi có > 10 dòng: sang trang 2 rồi đổi số dòng → quay về trang 1.

## Quyền

- [ ] MANAGER chỉ có `*_READ`: thấy 3 mục menu (Vật tư, Loại vật tư, Đơn vị), không có nút ghi nào.
- [ ] Bỏ `UNIT_READ` của một vai trò: mất mục menu Đơn vị; ở Vật tư mất nút Thêm / Sửa và bảng quy đổi.
- [ ] Bỏ `UNIT_UPDATE`: thấy bảng quy đổi nhưng không có nút Thêm / thao tác dòng.

## Giao diện

- [ ] Chrome 320 / 375 / 1100 / 1400px, sáng + tối: bảng không cuộn ngang ngoài ý muốn, nút ⋯ không bị che.
- [ ] Tên / mô tả rất dài, mã 32 ký tự, tỉ lệ 6 số lẻ, 0 / 1 / nhiều đơn vị quy đổi.

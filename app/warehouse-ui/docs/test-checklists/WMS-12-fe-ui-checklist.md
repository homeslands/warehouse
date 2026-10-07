# Checklist test tay — WMS-12 Quản lý người dùng

Môi trường: sandbox. Tài khoản: root / `0310000000` (ADMIN) / `0340000000` (MANAGER) / `0330000000` (SUPERVISOR) —
mật khẩu hỏi trưởng nhóm, không ghi vào repo.

## Truy cập

- [ ] SUPERVISOR: không thấy mục "Người dùng" trên menu; gõ `/users` → trang 403.
- [ ] MANAGER: thấy "Người dùng" trong nhóm Quản trị; không có nút "Thêm người dùng", không có ô lọc vai trò.
- [ ] ADMIN / root: có nút "Thêm người dùng" và ô lọc vai trò.

## Danh sách, tìm kiếm, lọc, sắp xếp

- [ ] Tài khoản chưa khai tên (root) hiện "root" ở cột Họ tên, không ô trống.
- [ ] Dòng của chính mình có nhãn "Bạn" và không có nút thao tác.
- [ ] MANAGER: chỉ thấy chính mình + người cấp thấp hơn (lọc ở client), có dòng ghi chú số dòng bị ẩn.
- [ ] Ngày tạo hiện dạng `dd/MM/yyyy HH:mm`; cột "Kho" hiện các kho người đó là thành viên.
- [ ] Gõ tên (vd `Test`) → Network gửi `name`, không gửi `phonenumber`.
- [ ] Gõ toàn chữ số (vd `0390`) → Network gửi `phonenumber`, không gửi `name`; xoá trắng → không gửi cả hai.
- [ ] Lọc vai trò MANAGER → chỉ còn người MANAGER; URL có `roleSlug`, F5 giữ bộ lọc.
- [ ] Lọc trạng thái (Hoạt động / Đã khoá) hoạt động; URL có `isActive`.
- [ ] Ô lọc kho chỉ hiện với người có `WAREHOUSE_READ`; chọn kho → chỉ còn thành viên kho đó.
- [ ] Lọc "Ngày tạo": bấm 2 ngày (thứ tự nào cũng được) → nút hiện `dd/MM/yyyy – dd/MM/yyyy`, Network gửi `startDate` ≤ `endDate`; bấm 1 ngày rồi đóng lịch → "Từ …", chỉ gửi `startDate`; nút ✕ xoá lọc.
- [ ] Sửa tay URL `startDate` > `endDate` → vẫn ra kết quả (FE đảo lại), không báo lỗi 100422.
- [ ] Bấm tiêu đề cột Họ tên / SĐT / Ngày tạo → sắp xếp tăng/giảm; URL có `sort`.
- [ ] Chuyển trang / đổi số dòng hoạt động.

## Tạo người dùng (ADMIN)

- [ ] Ô vai trò chỉ có Giám sát, Quản lý (không có Quản trị viên / Quản trị cấp cao).
- [ ] Bấm "Thêm người dùng" khi trống → lỗi ở mọi ô bắt buộc cùng lúc.
- [ ] SĐT `0123456789` → "Số điện thoại gồm 10 chữ số…"; email `abc` → "Email không hợp lệ"; ngày sinh tương lai → lỗi.
- [ ] Mật khẩu dưới 8 ký tự → lỗi tại ô; từ 8 ký tự trở lên qua.
- [ ] SĐT đã tồn tại (`0310000000`) → lỗi ngay dưới ô SĐT, sheet vẫn mở.
- [ ] Tạo thành công → toast, sheet đóng, người mới ở đầu danh sách. Đóng/mở lại sheet → form trống.

## Sửa hồ sơ (ADMIN)

- [ ] Mở form sửa → các ô điền sẵn giá trị hiện tại.
- [ ] Chỉ đổi họ → Network `PATCH` chỉ có trường `firstName`/`lastName` đã đổi, không gửi trường khác.
- [ ] Xoá trống email / ngày sinh / địa chỉ rồi lưu → giá trị cũ được giữ nguyên (có gợi ý dưới ô).

## Đổi vai trò (ADMIN)

- [ ] Dòng MANAGER/SUPERVISOR có "Đổi vai trò"; dòng ADMIN khác, root, chính mình thì không.
- [ ] Phải gõ đúng tên đăng nhập mới bấm được nút xác nhận; thành công → toast, cột vai trò đổi.

## Đặt lại mật khẩu

- [ ] ADMIN: dòng MANAGER/SUPERVISOR có "Đặt lại mật khẩu"; dòng ADMIN khác, root, chính mình thì không.
- [ ] MANAGER: chỉ dòng SUPERVISOR có nút; dòng ADMIN KHÔNG có (dù backend hiện cho phép — bug #1 proposal).
- [ ] Dialog nêu tên người đó và cảnh báo bị đăng xuất; phải gõ xác nhận; nhập lại không khớp → lỗi tại ô; dưới 8 ký tự → lỗi.
- [ ] Đặt lại thành công → toast; người đó đang đăng nhập ở trình duyệt khác bị đưa về màn đăng nhập ở thao tác kế tiếp.
- [ ] Nút "Hiện mật khẩu" hiện cả hai ô; mở lại dialog → ô trống, mật khẩu ẩn.

## Khoá / mở khoá (ADMIN)

- [ ] Dòng đang hoạt động có "Khoá"; dòng đã khoá có "Mở khoá"; dòng ADMIN khác, root, chính mình thì không.
- [ ] Khoá: phải gõ đúng SĐT đăng nhập mới bấm được xác nhận. Network chỉ có `PUT /users/{slug}/lock` — KHÔNG có
      request `DELETE /users/...` nào.
- [ ] Khoá thành công → toast, trạng thái "Đã khoá"; người đó đang đăng nhập bị đưa về màn đăng nhập.
- [ ] Mở khoá: không cần gõ xác nhận; Network chỉ có `PUT /users/{slug}/unlock`; trạng thái về "Hoạt động".
- [ ] Khoá người đang quản lý kho → lỗi 100415 hiện bằng tiếng Việt, hộp vẫn mở.
- [ ] Không có nút "Xoá" ở bất kỳ đâu trong màn Người dùng.

## Thành viên kho (trang chi tiết kho)

- [ ] ADMIN: khối "Thành viên" hiện danh sách; có nút "Thêm thành viên" và nút "Gỡ" ở từng dòng.
- [ ] MANAGER (chỉ `USER_READ`): thấy danh sách thành viên, KHÔNG thấy "Thêm thành viên" / "Gỡ".
- [ ] Thêm: ô chọn chỉ liệt kê ứng viên (từ `available-members`); chọn → thêm → toast, người đó vào danh sách VÀ
      biến khỏi ô chọn khi mở lại.
- [ ] Gán người vai trò ADMIN (nếu gọi được) → lỗi 100524 hiện bằng tiếng Việt.
- [ ] Gỡ: hộp xác nhận không cần gõ chữ; thành công → toast, người đó rời danh sách và quay lại ô chọn ứng viên.

## Đa ngôn ngữ / giao diện

- [ ] Đổi sang English: mọi nhãn, lỗi, toast của màn đều tiếng Anh (gồm khối thành viên kho và mã lỗi mới).
- [ ] Dark mode và bề rộng điện thoại: bảng ẩn cột phụ, còn Họ tên / Trạng thái / Thao tác.

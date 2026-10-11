# Checklist test tay — WMS-15 phần 2, Vai trò

Môi trường: sandbox. Tài khoản cần `ROLE_READ` + `ROLE_CREATE/UPDATE/DELETE` (ba mã ghi chỉ SUPER_ADMIN cấp được) và
một tài khoản chỉ có `ROLE_READ` — mật khẩu hỏi trưởng nhóm, không ghi vào repo. Dữ liệu thử đặt tên bắt đầu bằng
`ZZ Test vai trò` để dọn sau (tên không dùng lại được sau khi xoá — mỗi lần thử đổi hậu tố).

## Danh sách `/roles`

- [ ] Menu nhóm Quản trị có "Vai trò" ngay trước "Phân quyền"; thiếu `ROLE_READ` thì không có mục, gõ thẳng → `/forbidden`.
- [ ] Bảng xếp cấp giảm dần; vai trò có sẵn hiện nhãn tiếng Việt + mã dòng phụ + badge "Có sẵn"; dòng của mình có "Bạn".
- [ ] Dòng của mình và dòng cấp cao hơn không có nút ⋯.
- [ ] Vai trò có sẵn thấp hơn mình: mục Xoá bị khoá, có dòng lý do "Vai trò có sẵn không xoá được".

## Tạo

- [ ] Ô Cấp có gợi ý "Đang có: Giám sát 10 · Quản lý 20 · …" và "Bạn tạo được cấp 1–29" (ADMIN).
- [ ] Tên `admin`, `Quản lý`, `  manager ` → "Trùng tên một vai trò đang có", không gửi.
- [ ] Cấp 30 (ADMIN) → báo vượt mức tại ô Cấp; cấp `1,5` không gõ được.
- [ ] SUPER_ADMIN: gợi ý "Bạn tạo được cấp 1–99"; cấp 100 bị chặn tại ô.
- [ ] Tạo `ZZ Test vai trò <hậu tố>` cấp 15 → hộp xác nhận ghi "trên Giám sát, dưới Quản lý" + cảnh báo tên không đổi /
      không dùng lại → tạo xong có trong bảng giữa Quản lý và Giám sát.
- [ ] Màn Phân quyền: có cột vai trò mới giữa Quản lý và Giám sát, bật / tắt được một quyền.
- [ ] Màn Người dùng: ô lọc vai trò + ô gán vai trò (form tạo / đổi vai trò) có vai trò mới.

## Sửa / Xoá

- [ ] Sửa mô tả: Tên + Cấp chỉ đọc; chưa đổi thì Lưu bị khoá; xoá trống mô tả lưu được → cột Mô tả thành "Chưa có".
- [ ] Gán vai trò thử cho một người dùng → Xoá vai trò → báo trong hộp "Vai trò còn người dùng" + link "Xem người dùng
      của vai trò này" mở `/users?roleSlug=…` đã lọc; đóng rồi mở lại hộp → không còn câu lỗi cũ.
- [ ] Đổi người dùng đó sang vai trò khác → xoá vai trò thử được.
- [ ] Tạo lại đúng tên vừa xoá → "Tên vai trò đã tồn tại (kể cả vai trò đã xoá)" tại ô Tên.

## Quyền / giao diện

- [ ] Tài khoản chỉ `ROLE_READ`: không có nút Thêm, không có cột thao tác.
- [ ] 375 / 1100 / 1400 px, sáng + tối: tên dài không tràn, mô tả dài cắt 2 dòng (di chuột thấy đủ), không cuộn ngang trang.

# Checklist test UI — nhánh `feature/WMS-9-fe-warehouse-store-management`

Phạm vi: WMS-9-fe (kho, cửa hàng, trang chi tiết, "Kho tôi quản lý") và WMS-10-fe (phân quyền, gác
quyền theo authority). Mỗi dòng là **thao tác → kết quả cần thấy**; chữ trong ngoặc kép là chữ thật
trên màn hình.

## Chuẩn bị

- [ ] Chạy app: `cd app/warehouse-ui && npm run dev` (Node 24), trỏ tới sandbox.
- [ ] Có sẵn 4 tài khoản: **SUPER_ADMIN**, **ADMIN**, **MANAGER** (nên đang quản lý ít nhất 1 kho),
      **SUPERVISOR**.
- [ ] Dùng kho/cửa hàng riêng để thử — sửa/xoá trên sandbox là dữ liệu thật.

## 1. Đăng nhập và giao diện chung

- [ ] Màn đăng nhập có nền ảnh, khung mờ trong suốt; trình duyệt tự điền mật khẩu thì ô nhập không bị
      nền trắng/vàng.
- [ ] Bật Caps Lock khi gõ mật khẩu → hiện "Caps Lock đang bật"; nút con mắt ẩn/hiện mật khẩu.
- [ ] Đăng nhập đúng → toast "Đăng nhập thành công".
- [ ] Menu Ngôn ngữ có cờ Việt/Anh tròn; menu Ngôn ngữ và Giao diện rộng rãi, không chật.
- [ ] Đổi sang English → toàn bộ chữ đổi, kể cả tên quyền ở màn Phân quyền.
- [ ] Đăng xuất → toast "Đã đăng xuất".

## 2. Danh sách Kho (`/warehouses`) — đăng nhập ADMIN

- [ ] "Tạo kho" → form; bỏ trống Mã/Tên/Địa chỉ rồi Lưu → báo lỗi tại từng ô.
- [ ] Tạo thành công → toast "Đã tạo kho", kho mới hiện trong bảng.
- [ ] Menu `⋯` của một dòng có: Sửa, Gán quản lý, Ngừng/Mở hoạt động, Xoá.
- [ ] Sửa → toast "Đã cập nhật kho", bảng cập nhật.
- [ ] Gán quản lý: chọn người → toast; "Bỏ gán" → cột Quản lý trống.
- [ ] Ngừng hoạt động → hộp xác nhận → trạng thái đổi.
- [ ] Kho **đang hoạt động** thì mục Xoá bị mờ, rê chuột thấy "Phải ngừng hoạt động kho trước khi xoá".
- [ ] Ngừng hoạt động rồi Xoá → hộp xác nhận → toast "Đã xoá kho".
- [ ] Bộ lọc Trạng thái, "Lọc theo quản lý", "Chỉ kho chưa có quản lý" lọc đúng; URL đổi theo, F5 vẫn
      giữ bộ lọc.

## 3. Chi tiết Kho (`/warehouses/:slug`)

- [ ] Lọc danh sách trước (vd Ngừng hoạt động), bấm **tên kho** → mở trang chi tiết.
- [ ] Breadcrumb và tiêu đề tab trình duyệt hiện **tên kho** (không phải chữ "Chi tiết").
- [ ] Header: tên, huy hiệu trạng thái, mã, nút **Sửa** và `⋯`.
- [ ] Chỉ có **một card "Tổng quan"**: Mã, Người quản lý, Điện thoại, Địa chỉ, Mô tả; trường trống hiện
      "—"; đáy card có dòng nhỏ "Tạo lúc … · Cập nhật lúc …".
- [ ] Có số điện thoại → số đó bấm được và mở ứng dụng gọi (`tel:`).
- [ ] Thu nhỏ cửa sổ: desktop 3 cột → tablet 2 cột → điện thoại 1 cột, không tràn ngang.
- [ ] Sửa từ trang chi tiết → lưu xong trang hiện ngay giá trị mới.
- [ ] "Quay lại danh sách" → về đúng danh sách với **bộ lọc cũ**.
- [ ] Xoá từ trang chi tiết (ngừng hoạt động trước) → quay về danh sách, **không** có toast lỗi 404.
- [ ] Gõ URL slug không tồn tại → "Không tìm thấy kho này — có thể đã bị xoá." kèm nút về danh sách.

## 4. "Kho tôi quản lý" — đăng nhập MANAGER

- [ ] `/warehouses` có hai nút "Tất cả kho" / "Kho tôi quản lý".
- [ ] Bấm "Kho tôi quản lý" → URL có `?scope=mine`, chỉ hiện kho MANAGER đó quản lý.
- [ ] Ở chế độ này, bộ lọc quản lý và ô "Chỉ kho chưa có quản lý" bị ẩn.
- [ ] MANAGER chưa quản lý kho nào → "Bạn chưa được phân công quản lý kho nào."
- [ ] Vào chi tiết một kho rồi quay lại → vẫn ở chế độ "Kho tôi quản lý".
- [ ] Đăng nhập ADMIN / SUPER_ADMIN → **không** thấy hai nút; tự gõ `?scope=mine` cũng không tác dụng.

## 5. Danh sách Cửa hàng (`/stores`) — đăng nhập ADMIN

- [ ] Tạo cửa hàng: bỏ trống Mã/Tên/Tên pháp lý/Mã số thuế → báo lỗi; mã số thuế sai →
      "Mã số thuế gồm 10 chữ số…".
- [ ] Sửa, Ngừng/Mở hoạt động, Xoá: có hộp xác nhận, có toast; đang hoạt động thì khoá Xoá.
- [ ] "Gán kho" → chọn kho → toast "Đã cập nhật kho của cửa hàng"; "Bỏ gán" → cột Kho liên kết trống.
- [ ] Bộ lọc Trạng thái lọc đúng.

## 6. Chi tiết Cửa hàng (`/stores/:slug`)

- [ ] Bấm tên cửa hàng → trang chi tiết, breadcrumb và tab hiện tên cửa hàng.
- [ ] Card "Tổng quan": Mã, Kho liên kết, Điện thoại, Email, Địa chỉ; bên dưới có đường kẻ và nhóm
      **"Pháp nhân & hoá đơn"** (Tên pháp lý, Mã số thuế, Địa chỉ xuất hoá đơn).
- [ ] Điện thoại bấm được (`tel:`), email bấm được (`mailto:`).
- [ ] Kho liên kết là link → mở trang chi tiết kho đó; chưa gán thì hiện "Chưa gán kho".
- [ ] Sửa / Gán kho / Ngừng hoạt động / Xoá chạy được từ trang chi tiết; xoá xong về danh sách, không
      toast 404.
- [ ] Role có Xem cửa hàng nhưng **không** có Xem kho → tên kho hiện dạng chữ thường, không bấm được
      (không bị đưa tới trang "Không đủ quyền").

## 7. Màn Phân quyền (`/permissions`)

- [ ] Cột xếp theo cấp: SUPER_ADMIN → ADMIN → MANAGER → SUPERVISOR; cột SUPER_ADMIN ghi "Toàn quyền",
      không bấm được.
- [ ] Tên quyền hiện tiếng Việt (English cũng dịch); mã gốc (vd `WAREHOUSE_CREATE`) vẫn giữ để đối
      chiếu.
- [ ] Rê chuột trên một dòng → cả dòng đổi nền đều nhau, kể cả cột đầu.
- [ ] Bấm một ô → hộp "Cấp quyền này cho vai trò?" / "Gỡ quyền này khỏi vai trò?"; xác nhận → toast
      "Đã cấp quyền" / "Đã gỡ quyền"; backend lỗi → toast lỗi, ô giữ nguyên.
- [ ] Ô bị khoá có lý do khi rê chuột (chỉ khi cờ `permissionDelegationRules` bật):
  - vai trò cao hơn mình → "Bạn chỉ chỉnh được quyền của vai trò cấp thấp hơn mình";
  - mình không có quyền đó → "Bạn không có quyền này nên không cấp/gỡ được…";
  - quyền hệ thống (Quản trị phân quyền, Sao lưu CSDL, Xem nhật ký, Tạo người dùng…) →
    "Quyền này chỉ quản trị viên cấp cao nhất cấp được".
- [ ] Tự gỡ "Quản trị phân quyền" của role mình → cảnh báo riêng "Tự bỏ quyền quản trị phân quyền?".

## 8. Gác quyền theo authority và đổi quyền khi đang dùng

Mở hai trình duyệt: **A** = ADMIN hoặc SUPER_ADMIN, **B** = MANAGER.

- [ ] A cấp `WAREHOUSE_CREATE` cho MANAGER → B quay lại tab hoặc sang màn khác → nút "Tạo kho" xuất
      hiện.
- [ ] A gỡ quyền đó → nút "Tạo kho" ở B biến mất; nếu B đang mở form và bấm Lưu → 403, UI tự nạp lại
      quyền và báo "Quyền của bạn vừa được cập nhật."
- [ ] A gỡ `WAREHOUSE_READ` của MANAGER khi B đang ở `/warehouses` → B chuyển tới trang
      "Quyền truy cập đã thay đổi".
- [ ] Menu bên trái của B chỉ hiện các màn B có quyền xem.
- [ ] Nút "Gán kho" ở màn Cửa hàng chỉ hiện khi có đủ Sửa cửa hàng + Sửa thông tin kho + Xem kho.

## 9. Tài khoản (`/account`)

- [ ] Hiện Tên đăng nhập và Vai trò.
- [ ] "Đổi mật khẩu": nhập lại không khớp → báo lỗi; thành công → toast
      "Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất."
- [ ] "Đăng xuất khỏi mọi thiết bị" → hộp xác nhận → toast "Đã đăng xuất khỏi mọi thiết bị", phải đăng
      nhập lại.

## Không cần test (đang tắt vì backend chưa có)

- Sắp xếp theo cột, ô tìm kiếm ở danh sách kho/cửa hàng (cờ `sort`, `search`).
- Mục Hồ sơ (họ tên, email) và Thiết bị đang đăng nhập ở trang Tài khoản (cờ `profileEdit`,
  `sessionList`).
- Vật tư trong kho — chưa làm, ngoài phạm vi nhánh này.

# Checklist test UI — WMS-9 (kho, cửa hàng) và WMS-10 (phân quyền)

Mỗi dòng: **làm gì → phải thấy gì**. Chữ trong ngoặc kép là chữ hiện trên màn hình.

## Chuẩn bị

- [ ] Có 4 tài khoản: **SUPER_ADMIN**, **ADMIN**, **MANAGER** (đang quản lý ít nhất 1 kho), **SUPERVISOR**.
- Trên giao diện vai trò hiện bằng **tên**, không phải mã: SUPER_ADMIN = "Quản trị cấp cao", ADMIN = "Quản trị viên",
  MANAGER = "Quản lý", SUPERVISOR = "Giám sát". Checklist này dùng mã cho ngắn.
- [ ] Dùng kho/cửa hàng tạo riêng để thử — sửa/xoá là dữ liệu thật.

## 1. Đăng nhập, giao diện chung

- [ ] Đăng nhập đúng → toast "Đăng nhập thành công". Đăng xuất → toast "Đã đăng xuất".
- [ ] Trình duyệt tự điền mật khẩu → ô nhập không bị nền trắng/vàng.
- [ ] Bật Caps Lock khi gõ mật khẩu → hiện "Caps Lock đang bật".
- [ ] Menu Ngôn ngữ có cờ Việt/Anh. Đổi sang English → mọi chữ đổi theo.
- [ ] Góc phải header: ảnh đại diện chữ viết tắt + **họ tên** + **tên vai trò** (vd "Quản trị viên", không phải
      `ADMIN`). Tài khoản chưa có họ tên → hiện "Người dùng" kèm icon (không hiện số điện thoại làm tên). Điện thoại: chỉ còn ảnh đại diện.
- [ ] Bấm vào → đầu menu **luôn** có họ tên (hoặc "Người dùng"), số điện thoại, email (nếu có), vai trò. Trang Tài khoản hiện giống vậy.
- [ ] Đổi sang English → tên vai trò thành "Administrator", "Manager"…

## 2. Danh sách Kho (`/warehouses`) — tài khoản ADMIN

- [ ] Thanh trên bảng: nút "Tạo kho" ở **ngoài cùng bên phải**, các bộ lọc nằm ngay bên trái nút.
- [ ] Tạo kho: bỏ trống Mã/Tên/Địa chỉ → báo lỗi dưới từng ô. Tạo đúng → toast "Đã tạo kho".
- [ ] Menu `⋯` của một hàng có: Sửa, Gán quản lý, Ngừng/Mở hoạt động, Xoá.
- [ ] Kho **đang hoạt động** → mục Xoá mờ, rê chuột thấy "Phải ngừng hoạt động kho trước khi xoá".
- [ ] Ngừng hoạt động → Xoá → xác nhận → toast "Đã xoá kho".
- [ ] Bộ lọc Trạng thái / "Lọc theo quản lý" / "Chỉ kho chưa có quản lý" lọc đúng; F5 vẫn giữ bộ lọc.
- [ ] "Lọc theo quản lý" và hộp "Gán quản lý" hiện **Họ tên (số điện thoại)**, vd "Nguyễn Văn A (0901234567)";
      người chưa có tên chỉ hiện số điện thoại. Gõ tên hoặc số điện thoại đều tìm được.
- [ ] **Bấm vào bất kỳ chỗ nào trên hàng** → mở trang chi tiết kho.
- [ ] Bấm nút `⋯` hoặc mục trong menu → **không** mở trang chi tiết.

## 3. Chi tiết Kho (`/warehouses/:slug`)

- [ ] Lọc danh sách trước, rồi mở một kho → breadcrumb và tên tab hiện **tên kho**.
- [ ] Chỉ có **một khung "Tổng quan"**: Mã, Người quản lý, Điện thoại, Địa chỉ, Mô tả. Ô trống hiện chữ xám "Chưa có".
- [ ] Cột "Quản lý" (danh sách) và "Người quản lý" (chi tiết) hiện **Họ tên (số điện thoại)**; chưa có → "Chưa có" / "Chưa có quản lý".
      Dòng nhỏ ở đáy khung: "Tạo lúc … · Cập nhật lúc …".
- [ ] Số điện thoại bấm được (mở ứng dụng gọi).
- [ ] "Sửa" → lưu → trang hiện ngay giá trị mới.
- [ ] "Quay lại danh sách" → về đúng danh sách, **giữ bộ lọc cũ**.
- [ ] Xoá từ trang chi tiết → quay về danh sách, **không** hiện lỗi 404.
- [ ] Gõ địa chỉ kho không tồn tại → "Không tìm thấy kho này — có thể đã bị xoá."

## 4. MANAGER chỉ thấy phần của mình — tài khoản MANAGER

- [ ] Màn Kho chỉ có các kho **mình được gán làm quản lý**; không có nút "Tất cả kho / Kho tôi quản lý".
- [ ] Không có bộ lọc "Lọc theo quản lý" và ô "Chỉ kho chưa có quản lý" (chỉ còn lọc Trạng thái).
- [ ] Chưa được gán kho nào → "Bạn chưa được phân công quản lý kho nào."
- [ ] Màn Cửa hàng chỉ có cửa hàng **gắn với kho mình quản lý**; không có → "Chưa có cửa hàng nào gắn với kho bạn quản lý."
- [ ] ADMIN gán MANAGER đó làm quản lý một kho khác → MANAGER tải lại danh sách thấy thêm kho đó (và cửa hàng gắn với nó).

## 5. Danh sách và chi tiết Cửa hàng (`/stores`) — tài khoản ADMIN

- [ ] Tạo cửa hàng: bỏ trống Mã/Tên/Tên pháp lý/Mã số thuế → báo lỗi; mã số thuế sai → báo lỗi định dạng.
- [ ] Sửa, Ngừng/Mở hoạt động, Xoá, Gán kho / Bỏ gán → có hộp xác nhận và toast.
- [ ] Bấm vào hàng → mở chi tiết. Khung "Tổng quan" có thêm nhóm **"Pháp nhân & hoá đơn"** bên dưới.
- [ ] Chi tiết cửa hàng có "Người quản lý" = quản lý của kho đang gắn; chưa gắn kho / kho chưa có quản lý → "Chưa có quản lý".
- [ ] Điện thoại và email bấm được. Kho liên kết là link sang trang kho; chưa gán → "Chưa gán kho".
- [ ] Role có xem cửa hàng nhưng **không** xem được kho → tên kho hiện dạng chữ, không bấm được.

## 6. Mỗi vai trò thấy gì (quyền mặc định)

Trước khi test, mở màn Phân quyền xem đang cấp gì — môi trường đã có người chỉnh thì kết quả khác bảng dưới.

| Vai trò | Kho / Cửa hàng |
|---|---|
| SUPER_ADMIN | Làm được mọi thứ, kể cả khi không có ô nào được bật |
| ADMIN | Xem, tạo, sửa, xoá, gán quản lý, gán kho |
| MANAGER, SUPERVISOR | Chỉ xem |

- [ ] Đăng nhập từng vai trò → nút hiện đúng như bảng.
- [ ] MANAGER / SUPERVISOR: không có nút "Tạo", không có cột Thao tác (nút `⋯`), không có menu "Phân quyền".
- [ ] Mỗi nút đi theo **một quyền riêng** — tắt đúng quyền đó thì chỉ nút đó biến mất:

| Nút | Cần quyền |
|---|---|
| Menu "Kho" và xem danh sách/chi tiết kho | Xem danh sách/chi tiết kho |
| "Tạo kho" | Tạo kho |
| "Sửa", "Ngừng/Mở hoạt động" (kho) | Sửa thông tin kho |
| "Gán quản lý" | Phân công quản lý kho **và** Xem danh sách người dùng **và** Xem vai trò |
| Bộ lọc "Lọc theo quản lý" | Xem danh sách người dùng **và** Xem vai trò |
| "Xoá" (kho) | Xoá kho |
| Menu "Cửa hàng", "Tạo", "Sửa", "Xoá" (cửa hàng) | Xem / Tạo / Sửa / Xoá cửa hàng |
| "Gán kho" (cửa hàng) | Sửa cửa hàng **và** Sửa thông tin kho **và** Xem kho |
| Menu "Phân quyền" | Quản trị phân quyền **và** Xem vai trò |

- [ ] Không có quyền mà gõ thẳng địa chỉ (vd `/permissions`) → trang "Không đủ quyền".

## 7. Luật khi chỉnh quyền (màn `/permissions`)

- [ ] Bấm một ô → hộp xác nhận → toast "Đã cấp quyền" / "Đã gỡ quyền".
- [ ] **Chỉ chỉnh được vai trò thấp hơn mình.** ADMIN: cột ADMIN ghi "Chỉ xem" (dấu ✓/—, không có công tắc),
      chỉnh được MANAGER và SUPERVISOR. SUPER_ADMIN chỉnh được mọi cột.
- [ ] **Chỉ cấp/gỡ được quyền mình đang có.** Ô của quyền mình không có bị khoá, rê chuột thấy
      "Bạn không có quyền này nên không cấp/gỡ được…".
- [ ] **Quyền hệ thống chỉ SUPER_ADMIN cấp:** Quản trị phân quyền, Sao lưu cơ sở dữ liệu, Xem nhật ký hệ thống,
      Tạo người dùng, Đặt lại mật khẩu người dùng → với ADMIN các ô này bị khoá.
- [ ] **Gỡ quyền lan xuống cấp dưới:** SUPER_ADMIN gỡ "Xem danh sách/chi tiết kho" của ADMIN → ô đó của
      MANAGER và SUPERVISOR cũng tự tắt. **Cấp quyền thì không lan** — chỉ vai trò được chọn có thêm.
- [ ] Không gỡ được "Quản trị phân quyền" khỏi vai trò **cuối cùng** còn giữ nó (ô bị khoá, có lý do).
- [ ] Tự gỡ "Quản trị phân quyền" của vai trò mình → cảnh báo "Tự bỏ quyền quản trị phân quyền?"; xác nhận
      → mất menu Phân quyền ngay.

## 8. Đổi quyền khi người dùng đang mở app

Hai trình duyệt: **A** = ADMIN hoặc SUPER_ADMIN, **B** = MANAGER.

- [ ] A cấp "Tạo kho" cho MANAGER → B quay lại tab → thấy nút "Tạo kho", tạo được thật.
- [ ] A gỡ quyền đó → nút ở B biến mất; nếu B đang mở form và bấm Lưu → báo "Quyền của bạn vừa được cập nhật."
- [ ] A gỡ "Xem danh sách/chi tiết kho" khi B đang ở `/warehouses` → B chuyển tới "Quyền truy cập đã thay đổi",
      menu "Kho" biến mất.
- [ ] B **không cần đăng nhập lại** trong mọi trường hợp trên.

## 9. Tài khoản (`/account`)

- [ ] Đổi mật khẩu: nhập lại không khớp → báo lỗi; thành công → toast, các thiết bị khác bị đăng xuất.
- [ ] "Đăng xuất khỏi mọi thiết bị" → xác nhận → phải đăng nhập lại.

## 10. Màn hình nhỏ (DevTools → chế độ thiết bị, thử 375px và 768px)

- [ ] Không trang nào có thanh cuộn ngang ở cả trang.
- [ ] Điện thoại: header chỉ còn tên trang hiện tại và icon tài khoản, không chữ nào chồng lên nhau.
- [ ] Điện thoại: bảng Kho/Cửa hàng chỉ còn Tên, Trạng thái, nút `⋯` — nút `⋯` nhìn thấy, không bị khuất.
- [ ] Màn rộng dần → các cột Mã, Địa chỉ, Quản lý, Ngày tạo… hiện lại dần. Mở/thu gọn sidebar cũng vậy.
- [ ] Điện thoại, màn Kho: bộ lọc gom vào nút "Bộ lọc" (có số bộ lọc đang bật) → bấm mở ngăn từ dưới lên.
- [ ] Điện thoại: form Sửa mở toàn màn; menu `⋯` và hộp xác nhận hiện đủ.
- [ ] Điện thoại, màn Phân quyền: bảng cuộn ngang trong khung, cột tên quyền đứng yên bên trái.

## Không cần test (backend chưa có)

- Sắp xếp theo cột, ô tìm kiếm.
- Mục Hồ sơ và Thiết bị đang đăng nhập ở trang Tài khoản.

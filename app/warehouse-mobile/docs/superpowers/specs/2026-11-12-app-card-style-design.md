# Đồng bộ kiểu card sang các màn còn lại — thiết kế

Ngày: 2026-11-12 · Trạng thái: **đã duyệt** (2026-11-12) · Local, không commit.
Kế thừa kiểu card của tab Tổng quan: `2026-11-12-overview-card-style-design.md` (bo 24, vòng icon xám 40pt + nhãn xám, dòng chính to đậm, hàng icon + chữ + ›, nút viên, liên kết "Xem tất cả ›"). Code hiện có: `src/features/overview-period/ui/DashCard.tsx` (`DashCard`, `CardHeader`, `CardRow`, `CardFooter`, `PillButton`, `CardLink`) + `Values.tsx`.

## Người dùng đã chốt

- **Cách làm:** đổi thành phần dùng chung + dòng danh sách; **giữ bố cục từng màn** (không thiết kế lại từng màn).
- **Danh sách phiếu / vật tư:** **mỗi mục là một card riêng**.
- **Phạm vi:** (1) danh sách + chi tiết **Nhập / Xuất / Tồn kho**; (2) **Tài khoản + Danh mục** (vật tư, đơn vị, loại vật tư, chi tiết). **Không** đổi form soạn phiếu 3 bước, kiểm hàng, sheet.
- Thiết kế + kế hoạch viết ở phiên này; **chạy ở phiên mới**.

## Nguyên tắc

1. **Không đổi hành vi**: dữ liệu, điều hướng, quyền, tìm/lọc, kéo làm mới, header native, testID, nhãn a11y giữ nguyên. Chỉ đổi trình bày.
2. **Bộ card dùng chung chuyển xuống `src/shared/ui/card/`** (`DashCard`, `CardHeader`, `CardRow`, `CardFooter`, `PillButton`, `CardLink`, `BigValue`, `StateValue`, `GroupTitle`), export qua `@/shared/ui`; `features/overview-period` và Tổng quan import lại từ đó (FSD: các màn khác không được import feature của Tổng quan cho phần trình bày chung).
3. **Opt-in, không đổi toàn cục**: `ListGroup` thêm `variant="card"` (bo 24, lề 20, đường kẻ giữa hàng thụt theo vòng icon); `ListRow` khi nằm trong `variant="card"` vẽ icon trong **vòng 40pt nền `fill`**, nhãn 17. Mặc định giữ nguyên để form / sheet (ngoài phạm vi) không đổi.
4. **Màu**: đầu card trung tính như Tổng quan. **Trạng thái được giữ màu** (vòng icon tô nhạt theo trạng thái phiếu / mức tồn) vì đó là thông tin; còn lại token trung tính.
5. Nền trang `grouped`, khoảng giữa card **10** (danh sách) / **14** (màn chi tiết), lề ngang 16.

## Áp vào từng vùng

### Danh sách (mỗi mục một card)

- `ImportFormRow`, `ExportFormRow`: card bo **20** (mục danh sách nhỏ hơn card tóm tắt), lề 16; trái vòng icon 40 tô nhạt theo trạng thái (giữ icon trạng thái hiện có); giữa: mã phiếu (`Text code`, semibold 17) + dòng phụ muted (ngày · người · trạng thái như hiện tại); phải: số tiền (`Text numeric`) + `›`. Cao ≥ 72.
- `StockRow` (tab Tồn kho): cùng khung; giữa: tên vật tư + mã (`Text code`) muted; phải: số tồn + đơn vị, viên mức tồn (`LevelPill`) như hiện tại.
- Danh sách danh mục (`catalog-list`, `material-list`): cùng khung, vòng icon trung tính (không có trạng thái).
- `SectionHeader` của các danh sách (nhóm theo trạng thái / Đang dùng – Chưa dùng): giữ nguyên.
- Ô tìm kiếm, viên lọc, nút tạo nổi: giữ nguyên.

### Chi tiết phiếu (`import-detail`, `export-detail`)

- `ImportDetailHero` / `ExportDetailHero` → **một `DashCard`**: đầu card (vòng icon trạng thái + nhãn "Phiếu nhập" / "Phiếu xuất" + viên trạng thái bên phải), **dòng chính = tổng tiền** to đậm, dòng phụ = mã phiếu + ngày, các thông tin còn lại (bên bán / người nhận, HĐ, PO, người lập, người xác nhận…) thành `CardRow` không mũi tên (giá trị bên phải).
- Danh sách dòng vật tư của phiếu → **một card lớn chứa các dòng** (`ListGroup variant="card"`), mỗi dòng: tên + mã, số lượng × đơn giá, thành tiền bên phải.
- Nút hành động hiện có (Kiểm hàng, Sửa, Xác nhận, Huỷ…) giữ vị trí / logic; nút phụ trong card (nếu có) dùng `PillButton`.

### Chi tiết vật tư tồn kho (`stock-detail`)

- `StockHero` → `DashCard`: dòng chính = số tồn + đơn vị, dòng phụ = khả dụng / giữ chỗ, viên mức tồn; ngưỡng min/max thành `CardRow`.
- Các nhóm lô, lịch sử biến động → `ListGroup variant="card"`.

### Tài khoản (`account`)

- `ProfileHero` → `DashCard` (ảnh đại diện, họ tên to, vai trò muted).
- Các nhóm (Làm việc, Danh mục, Cài đặt…) → `ListGroup variant="card"` với vòng icon xám.

### Danh mục chi tiết (`catalog-detail`, `material-detail`, `MaterialWarehousesSection`)

- Nhóm thông tin → `ListGroup variant="card"`; đầu trang (tên + mã) → `DashCard` gọn.

## Không làm

Form soạn phiếu 3 bước, kiểm hàng (`receive`), mọi sheet, màn đăng nhập / chọn kho / đổi mật khẩu / ngôn ngữ, header native, thanh tab.

## Anti-goal

Đổi kiểu làm vỡ hành vi (mất chạm, mất testID, mất nhãn a11y); form/sheet bị đổi theo ngoài ý muốn vì sửa thành phần dùng chung.

## Các quyết định đã tự chốt (để bạn soát)

1. Bộ card chuyển xuống `shared/ui/card` để mọi màn dùng chung.
2. `ListGroup`/`ListRow` đổi kiểu bằng `variant="card"` (opt-in), không đổi mặc định — form và sheet ngoài phạm vi giữ nguyên.
3. Card mục danh sách bo **20** (card tóm tắt / chi tiết bo 24).
4. Màu trạng thái phiếu / mức tồn giữ trong vòng icon (thông tin), đầu card còn lại trung tính.
5. Dòng vật tư trong chi tiết phiếu gộp thành một card nhiều dòng (khác danh sách phiếu: mỗi phiếu một card).
6. `SectionHeader` danh sách giữ nguyên.

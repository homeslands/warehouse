# Phân quyền theo vai trò

Nguồn: BRD §5 (bản đã sửa đổi, chốt ngày 2026-09-23). Tài liệu này là **bản tra cứu cho frontend** —
gác `handle.roles` của route và hiện/ẩn nút theo đúng đây, đừng suy diễn lại từ BRD.

## Vai trò

| Role | Là ai | Vai trò cốt lõi |
|---|---|---|
| `ADMIN` | IT / quản trị hệ thống | Mọi thứ, kể cả quản trị hệ thống |
| `MANAGER` | Chủ quán (anh Huy) | Toàn bộ nghiệp vụ kho: tạo, sửa, **và duyệt** |
| `SUPERVISOR` | Nhân viên kho hạng cao | Vận hành hằng ngày: tạo và sửa phiếu **của mình**, không duyệt |

`SUPER_ADMIN` **không có trong BRD** nhưng có trong `RoleEnum` của backend, và `hasRole` của FE cho nó
đi qua mọi cổng. Trên thực tế nó mạnh hơn `ADMIN`. Đừng liệt kê nó trong `handle.roles`.

`Staff` xuất hiện ở BRD §1.3 (stakeholder) nhưng **không được định nghĩa quyền ở §5 và không có
trong code**. Chưa phải việc của FE.

## Bốn loại phiếu — nhập kho, xuất kho, kiểm kho, chi kho

Sau sửa đổi, **cả ba role đều tạo và sửa được**; khác nhau nằm ở *duyệt* và ở *phạm vi*.

| Hành động | ADMIN | MANAGER | SUPERVISOR |
|---|---|---|---|
| Tạo phiếu | ✓ | ✓ | ✓ |
| Sửa / xoá Draft | ✓ | ✓ (**mọi phiếu**) | ✓ (**chỉ của mình**) |
| Sửa / xoá Confirmed | ✗ | ✗ | ✗ |
| Xác nhận / phê duyệt | ✓ | ✓ | ✗ |
| Duyệt xuất huỷ | ✓ | ✓ | ✗ |
| In / Export | ✓ | ✓ | ✓ |

Ba luật đi kèm:

1. **Confirmed là bất biến với MỌI role**, kể cả ADMIN. Phiếu đã xác nhận thì ẩn hẳn nút Sửa/Xoá.
2. **Không chặn tự duyệt.** Người tạo phiếu được phép tự xác nhận phiếu của mình (chốt 2026-09-23).
   FE **không** cần so `createdBy` với người đang đăng nhập để khoá nút.
3. **Kiểm kho** có thêm khái niệm *được phân công*: SUPERVISOR chỉ thao tác trên phiếu mình được
   phân công. MANAGER và ADMIN không bị giới hạn này.

## Chỉ ADMIN

Quản lý user (tạo/sửa/xoá, đặt lại mật khẩu, xem lịch sử hoạt động); cấu hình hệ thống (ngưỡng cảnh
báo, đơn vị tính chung, phương thức và điều khoản thanh toán); backup & restore; audit trail và
error log.

## MANAGER (ngoài phần phiếu)

Danh mục: **xem** sản phẩm (đồng bộ từ bên thứ ba nên không sửa); **thêm/sửa** nguyên vật liệu và
nhà cung cấp; quản lý đơn vị tính của NVL. Công thức: tạo/sửa/copy, xem lịch sử. Tồn kho: dashboard,
cảnh báo, đặt ngưỡng min/max. Báo cáo: xem tất cả và export. Cảnh báo: bật/tắt theo loại.

## SUPERVISOR (ngoài phần phiếu)

Danh mục, công thức, đơn vị tính: **chỉ xem**. Tồn kho: xem số lượng và cảnh báo. Báo cáo kho: xem và
export. Tạo đề xuất đặt hàng khi tồn < ngưỡng min. Upload chứng từ kèm phiếu.

## CÒN TREO — chưa chốt với BA

**Phạm vi XEM của SUPERVISOR.** BRD mâu thuẫn với chính nó:

| | BRD §5.4 (văn bản) | BRD §5.5 (bảng) |
|---|---|---|
| Phiếu nhập / xuất | "của chính mình + do Manager tạo" | "Xem all ✓" |
| Phiếu chi | "của chính mình + do Manager tạo" | "của mình" |

Chưa chốt thì **chưa làm bộ lọc theo người tạo** trên màn danh sách phiếu. Nó quyết định danh sách có
cần cột "Người tạo" và bộ lọc tương ứng hay không.

## Ghi chú kỹ thuật cho người làm FE

- **Gác theo đúng thứ backend kiểm, từng endpoint một.** Endpoint gắn `@RequireAuthority(X)` → FE
  `can(user, 'X')`; endpoint gắn `@HasRole(...)` → `hasRole`. Hướng đã chọn là **authority** (vai trò
  chỉ là một gói quyền admin bật/tắt ở `/permissions`), nhưng backend mới chuyển 6/46 mã — xem mục
  Quyền trong `CLAUDE.md` và `docs/proposals/2026-09-24-authority-based-guards.md`. Màn nào backend
  còn `@HasRole` thì FE giữ `hasRole`: hiện nút theo quyền trong khi backend hỏi vai trò là để người
  dùng thấy nút rồi ăn 403.
- **Luật "của mình" / "được phân công" là luật mức bản ghi**, role không diễn đạt được. Backend hiện
  chỉ có `@HasRole` ở mức endpoint; phải có endpoint tự lọc theo `userId` (kiểu
  `GET /warehouses/mine`) hoặc trả `createdBy` để FE ẩn nút. Chưa có thì đừng giả vờ đã gác.
- **`can()` / `scope` chạy thật.** `/auth/me` trả `scope` là mảng mã authority, nạp từ Redis mỗi
  request. Bảng vai trò ở tài liệu này là **mục tiêu nghiệp vụ**; nó chỉ thành hiện thực trên
  hệ thống khi (1) backend gác endpoint tương ứng bằng `@RequireAuthority` và (2) admin bật đúng ô ở
  `/permissions`.

# Tổng quan: thẻ tiền + cảnh báo hạn dùng — thiết kế

Ngày: 2026-11-11 · Trạng thái: chờ duyệt · Local, không commit.
Kế thừa: `2026-11-11-overview-dashboard-design.md` (mọi hành vi đang có giữ nguyên).

## Mục đích

Đầu ca, người quản lý muốn thấy ngay **tiền vào/ra kho tháng này** và **lô vật tư sắp/đã hết hạn** — hai thứ dashboard hiện chưa có.

## Ràng buộc dữ liệu (đã kiểm backend, chỉ đọc)

- Tồn kho và lô **không có giá** → không tính "giá trị tồn kho" (ngoài phạm vi, cần backend).
- Phiếu có tổng tiền: phiếu nhập `total`, phiếu xuất `totalAmount` (server tính). Danh sách phiếu lọc được `status` + `startDate`/`endDate` (ngày lập).
- Lô: `GET /warehouses/:wh/material-batches` lọc `status` (1 = còn hàng), `expiryBefore` (ngày hết hạn **trước** ngày đó, lô không hạn bị loại), `sortBy=expiryDate`. Lô chỉ có `materialSlug` (không tên) → tên lấy từ danh sách tồn kho đã tải (`useInventory`).

## 1. Thẻ tiền "Tháng này" — đầu trang (ngay dưới dòng chào, trên lưới ô)

- Tiêu đề: "Tháng này · 01–11/11" (mùng 1 → hôm nay, giờ máy).
- Dòng **Nhập kho**: Σ `total` các phiếu nhập `CONFIRMED` lập trong kỳ. Dòng **Xuất kho**: Σ `totalAmount` phiếu xuất `CONFIRMED` trong kỳ. Mỗi dòng có **so sánh % với cùng kỳ tháng trước** (mùng 1 → cùng ngày tháng trước, kẹp về ngày cuối nếu tháng trước ngắn hơn): "▲12%" / "▼5%" (màu: chỉ dùng màu trung tính + mũi tên, không gán tốt/xấu); tháng trước = 0 → không hiện %.
- Dòng **Chênh lệch** = Nhập − Xuất, có dấu +/−. Chỉ hiện khi có cả hai quyền.
- Ngăn cách, rồi dòng **Đang chờ xử lý** = Σ `total` phiếu nhập `DRAFT` + Σ `totalAmount` phiếu xuất `PENDING` (không theo kỳ); chữ phụ "X phiếu nhập · Y phiếu xuất". Thiếu một quyền → chỉ cộng phần có quyền.
- Tiền luôn qua `formatMoney`, hiện đầy đủ (không viết tắt "tỷ/triệu"); số dùng `Text numeric`, căn phải, chữ tự co khi dài (`adjustsFontSizeToFit`, tối thiểu 0.7).
- Quyền: dòng Nhập cần `IMPORT_FORM_READ`, dòng Xuất cần `EXPORT_FORM_READ`; không quyền nào → ẩn thẻ. Không quyền → không gọi API.
- Dữ liệu: tải **hết các trang** phiếu trong kỳ (`fetchPagesUpToCap`, 100/trang, tối đa 50 trang) — tối đa 6 nhóm request (nhập/xuất × tháng này/tháng trước + 2 nhóm chờ xử lý). Vượt trần → dòng đó hiện "–" + chú thích "quá nhiều phiếu để tính". Lỗi → "!" như các ô khác, lỗi làm mới không xoá số đang có. Key nằm dưới tiền tố `'list'` của phiếu để xác nhận/huỷ phiếu làm mới luôn; gồm vào kéo-làm-mới và làm-mới-khi-focus.
- Đang tải: số "–" mờ (skeleton nhẹ). Chạm thẻ: không điều hướng.

## 2. Hai ô hạn dùng trong lưới "Việc cần làm"

- Thêm 2 ô sau 5 ô hiện có (lưới thành 7 ô, ô cuối nửa hàng như luật cũ):
  - **Quá hạn**: số lô còn hàng (`status=1`) có `expiryBefore=<hôm nay>` → `total`. Icon `calendar.badge.exclamationmark` (Android tương đương), màu destructive.
  - **Sắp hết hạn**: số lô còn hàng có `expiryBefore=<hôm nay + 61 ngày>` trừ số Quá hạn (tức còn 0–60 ngày, khớp `EXPIRY_SOON_DAYS = 60` và `expiryStatus` đang dùng). Icon `clock.badge.exclamationmark`, màu warning.
- 2 request đếm (`size=1`). Quyền như tab Tồn kho (`MATERIAL_READ` + `WAREHOUSE_READ`). Mục 0 nhạt, lỗi "!" — cùng luật các ô khác. Sang ngày mới → ngày tính lại (cùng cơ chế biểu đồ).
- Chạm ô → mở **sheet "Hạn dùng"** (dưới), cuộn tới nhóm tương ứng.

## 3. Sheet "Hạn dùng" (route sheet mới)

- Route sheet gốc theo luật `sheets.md` (`SheetStackLayout`, thêm vào `SHEET_ROUTES`), tham số `focus=expired|soon`.
- Nội dung: các lô còn hàng có hạn **trước hôm nay + 61 ngày**, `sortBy=expiryDate` tăng dần, tải theo trang (cuộn tải thêm). Chia 2 nhóm: **Quá hạn** (đỏ) rồi **Sắp hết hạn** (cam), tiêu đề nhóm có số đếm.
- Mỗi dòng: tên vật tư (từ tồn kho, thiếu → mã slug) + `Text code` mã vật tư, ngày hết hạn, "quá X ngày" / "còn X ngày", số còn lại theo đơn vị gốc. Chạm dòng → đóng sheet rồi mở chi tiết vật tư ở tab Tồn kho (`/stock/[materialSlug]`).
- Rỗng → trạng thái trống "Không có lô nào sắp hết hạn". Lỗi → thông báo + Thử lại.

## Không làm

Giá trị tồn kho; chọn kỳ khác ngoài tháng này; đổi ngưỡng 60 ngày; thông báo đẩy.

## Anti-goal

Số tiền sai lặng lẽ (thiếu trang mà vẫn hiện như đủ); thẻ tiền làm chậm cả màn (các ô và biểu đồ không chờ thẻ tiền).

## Các quyết định đã tự chốt (để bạn soát)

1. % so với cùng kỳ tháng trước, mũi tên màu trung tính.
2. Tiền hiện đầy đủ, chữ tự co thay vì viết tắt "tỷ/triệu".
3. "Quá hạn" = hết hạn trước hôm nay; hết hạn đúng hôm nay tính là "sắp hết hạn" (khớp `expiryStatus`).
4. Hai ô hạn dùng mở chung một sheet, cuộn tới nhóm tương ứng.
5. Vượt trần 5.000 phiếu/nhóm → hiện "–" kèm chú thích, không hiện số thiếu.

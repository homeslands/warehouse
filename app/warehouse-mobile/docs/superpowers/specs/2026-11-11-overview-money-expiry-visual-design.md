# Tổng quan: làm lại thẻ tiền + cảnh báo hạn dùng cho trực quan — thiết kế

Ngày: 2026-11-11 · Trạng thái: chờ duyệt · Local, không commit.
Kế thừa: `2026-11-11-overview-money-expiry-design.md` (cách tính số giữ nguyên) và `2026-11-11-overview-dashboard-design.md`.

## Mục đích

Bản vừa làm đúng số nhưng: thẻ tiền chỉ là các dòng chữ "nhãn — số" (thô, khó đọc nhanh); cảnh báo hạn dùng là 2 ô nhỏ lẫn trong lưới nên không "nhìn ra ngay". Mục tiêu: mở app là thấy ngay có lô quá hạn hay không, và đọc tiền tháng này trong một cái liếc.

## Bố cục mới (trên → dưới)

Tiêu đề + chào → **Banner hạn dùng** (chỉ khi có) → **Thẻ tiền** → Lưới "Việc cần làm" (**quay về 5 ô**, bỏ 2 ô hạn dùng) → **Thẻ Hạn dùng** → Tình trạng tồn kho → Hoạt động 7 ngày. Thêm **chấm đỏ trên tab Tổng quan**.

## 1. Thẻ tiền "Tháng này"

- Tiêu đề nhỏ "Tháng này · 01–11/11".
- **Số lớn** = Chênh lệch nhập − xuất (chữ to, đậm, có dấu +/−), nhãn nhỏ phía trên "Chênh lệch nhập − xuất". Chỉ khi có cả hai quyền; thiếu một quyền → số lớn là tổng của phần có quyền ("Nhập kho tháng này" hoặc "Xuất kho tháng này") và chỉ còn một ô con.
- **Hai ô con cạnh nhau**: Nhập (vòng icon xanh `accent`, mũi tên vào) / Xuất (vòng icon tím `chart2`, mũi tên ra). Mỗi ô: nhãn, số tiền, **viên %** so cùng kỳ tháng trước ("▲ 12%" / "▼ 5%", nền xám nhạt, màu trung tính — không gán tốt/xấu), và **sparkline** = đường tiền **cộng dồn theo ngày** từ mùng 1 tới hôm nay, có tô nhạt phía dưới đường, màu theo ô.
  - Dữ liệu sparkline lấy từ chính các phiếu đã tải để tính tổng (gom theo ngày lập `createdAt`, giờ máy) — **không thêm request**. Hàm tổng mở rộng trả thêm `byDay`.
  - Tháng mới mới 1 ngày → sparkline 1 điểm: vẽ chấm, không vẽ đường.
- **Viên "Chờ xử lý"** dưới cùng: icon đồng hồ + "Chờ xử lý 42 tr đ · 3 phiếu".
- Trạng thái: đang tải → khung xám nhạt (skeleton) đúng chỗ số; lỗi → "!"; vượt trần → "–" + chú thích như cũ; lỗi làm mới giữ số cũ.
- **Định dạng tiền rút gọn** (hàm mới `formatMoneyCompact` ở `shared/lib/format`): vi: ≥ 1 tỷ → "1,25 tỷ đ"; ≥ 1 triệu → "125,4 tr đ"; ≥ 1 nghìn → "850 N đ"; nhỏ hơn → đầy đủ. en: "1.25B đ" / "125.4M đ" / "850K đ". Tối đa 3 chữ số có nghĩa, bỏ ",0". **Chạm giữ** một số → hiện số đầy đủ (`formatMoney`) tại chỗ cho tới khi thả tay; VoiceOver luôn đọc số đầy đủ.
- Chạm thẻ: không điều hướng.

## 2. Banner hạn dùng (đầu trang)

- Chỉ hiện khi quá hạn > 0 hoặc sắp hết hạn > 0 (và đã có số; đang tải / lỗi → không hiện banner, thẻ Hạn dùng lo phần lỗi).
- Có quá hạn → nền `destructiveSoft`, icon tam giác cảnh báo màu `destructive`; chỉ có sắp hết hạn → nền `warningSoft`, icon `warning`.
- Chữ: dòng 1 đậm "2 lô đã quá hạn" (hoặc "5 lô sắp hết hạn" nếu không có quá hạn); dòng 2 nhỏ "5 lô sắp hết hạn trong 60 ngày" (khi có cả hai). Chevron bên phải.
- Chạm → sheet `/expiry-batches` với `focus=expired` (nếu có quá hạn) hoặc `focus=soon`. Rung nhẹ khi chạm.
- Không có nút đóng (cảnh báo thật thì phải luôn thấy).
- a11y: một nút, nhãn đọc cả hai số.

## 3. Thẻ "Hạn dùng" (thay 2 ô trong lưới)

- Tiêu đề "Hạn dùng" + chevron; chạm tiêu đề/thẻ → sheet (`focus` như banner).
- Hàng trên: **2 số lớn** cạnh nhau — "Quá hạn" (màu `destructive`) và "Sắp hết hạn" (màu `warning`); số 0 thì màu muted.
- Dưới: **3 lô hết hạn sớm nhất** (lấy trang đầu của `useExpiringBatches` với mốc hôm nay + 61, đã xếp tăng dần): tên vật tư (từ tồn kho, thiếu → slug), mã lô/ngày hết hạn ngắn, và **viên đếm ngược** bên phải: "Quá 4 ngày" (nền `destructiveSoft`, chữ `destructiveText`), "Hôm nay" / "Còn 6 ngày" (nền `warningSoft`, chữ `warningText`). Chạm một dòng → chi tiết vật tư ở tab Tồn kho.
- Nền thẻ: khi có quá hạn → viền trái/nhấn nhẹ màu `destructive` (hoặc nền `destructiveSoft` rất nhạt) — builder chọn một, miễn nhận ra khác thẻ thường; không có cảnh báo → thẻ thường.
- Không có lô nào → thẻ hiện trạng thái yên tâm: icon check xanh + "Không có lô nào sắp hết hạn".
- Đang tải → skeleton 2 số + 3 dòng; lỗi → "!" ở số + "Không tải được" + chạm để mở sheet (sheet có Thử lại).
- Quyền: như tồn kho; không quyền → không có thẻ, không banner, không chấm tab.

## 4. Chấm đỏ trên tab Tổng quan

- `NativeTabs.Trigger.Badge` trên tab `overview` = **số lô quá hạn** (chỉ quá hạn); 0 / chưa có số / lỗi / không quyền → không hiện.
- Dùng cùng query đếm quá hạn (cùng key → không thêm request khi Tổng quan đã tải). Đặt ở tầng `bootstrap` (`TabsLayout`) qua hook của entity; sang ngày mới / đổi kho → số theo kho và ngày hiện tại.

## Lưới "Việc cần làm"

Bỏ 2 key `expired`/`expiringSoon` khỏi `overviewTodos` → lại 5 ô như bản dashboard.

## Không làm

Không đổi cách tính số tiền/hạn dùng, không thêm API, không thêm thư viện, không thông báo đẩy.

## Các quyết định đã tự chốt (để bạn soát)

1. Sparkline vẽ tiền **cộng dồn** (đường đi lên), không phải tiền từng ngày (răng cưa).
2. Rút gọn: "tr" / "tỷ" / "N" (nghìn); en "K/M/B"; chạm giữ để xem đầy đủ.
3. Banner không có nút đóng.
4. Thẻ Hạn dùng khi không có gì vẫn hiện (trạng thái yên tâm) thay vì ẩn.
5. Chấm tab chỉ đếm quá hạn.

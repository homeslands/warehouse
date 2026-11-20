# Tab Tổng quan — bản dashboard (warehouse-mobile) — thiết kế

Ngày: 2026-11-11 · Trạng thái: chờ duyệt · Tài liệu local, không commit.
Kế thừa: `2026-11-11-overview-tab-design.md` (bản danh sách đã làm xong). Mọi điều ở bản cũ **vẫn giữ** trừ phần giao diện được thay dưới đây.

## Mục đích

Bản danh sách đúng chức năng nhưng chưa "nhìn là hiểu". Người dùng muốn Tổng quan trực quan như một dashboard **chuẩn Apple (HIG)**: mở app là thấy ngay việc chờ, sức khoẻ tồn kho và nhịp nhập/xuất tuần qua.

## Giữ nguyên từ bản cũ

- Tab đầu, mở mặc định; header tiêu đề lớn + nút kho; dòng chào (họ tên) + tên kho.
- 5 mục việc cần làm, cùng quyền ẩn/hiện, cùng cách đếm (cả kho), cùng `href` + `preset` khi chạm, mục 0 vẫn hiện (nhạt), mục lỗi hiện "!" và vẫn chạm được.
- Kéo để làm mới; tự làm mới query đã cũ khi quay lại tab; key đếm nằm dưới tiền tố `'list'`.
- Không sửa backend, không thêm thư viện (đã có `react-native-svg`, `expo-symbols`, `react-native-reanimated`).

## Bố cục mới (trên → dưới)

### 1. Lưới ô "Việc cần làm" — kiểu ô thông minh của app Lời nhắc

- Lưới **2 cột**. Mỗi ô: vòng tròn màu chứa icon SF Symbol (góc trên trái), **số to** (góc trên phải, `Text numeric`, đậm), nhãn ngắn ở dưới (tối đa 2 dòng).
- Thứ tự ô: chờ kiểm hàng → chờ duyệt xuất → xuất nháp → hết/dưới mức → vượt mức. _(Đổi so với bản cũ: "chờ duyệt" lên vị trí 2 vì là việc gấp hơn xuất nháp.)_
- Ô không có quyền bị bỏ, các ô còn lại dồn lại; số ô lẻ thì ô cuối rộng nửa hàng (như Lời nhắc).
- Màu vòng icon (lấy từ token theme, có bản tối):

  | Ô              | Icon SF (gợi ý)                                      | Màu                                                |
  | -------------- | ---------------------------------------------------- | -------------------------------------------------- |
  | Chờ kiểm hàng  | `tray.and.arrow.down.fill`                           | accent (xanh)                                      |
  | Chờ duyệt xuất | `clock.badge.checkmark.fill` (fallback `clock.fill`) | accent nếu có `EXPORT_FORM_CONFIRM`, ngược lại xám |
  | Xuất nháp      | `square.and.pencil`                                  | xám                                                |
  | Hết / dưới mức | `exclamationmark.triangle.fill`                      | warning (cam)                                      |
  | Vượt mức       | `arrow.up.circle.fill`                               | info                                               |

  Android: icon Material tương đương qua `md` của `expo-symbols` (như `TabsLayout`).

- Ô bằng 0: vòng icon xám nhạt, số màu muted. Đang tải: số "–". Lỗi: số thay bằng "!" màu destructive.
- Nền ô: màu thẻ (`card`), bo góc lớn (~16), không viền, trên nền nhóm (`grouped`) — như Lời nhắc / Cài đặt iOS. Nhấn: đổi nền `rowPressed` + rung nhẹ (`haptics`).
- a11y: mỗi ô là một nút, nhãn đọc "Phiếu nhập chờ kiểm hàng, 3".

### 2. Thẻ "Tình trạng tồn kho" — vòng donut

- Thẻ toàn chiều rộng: tiêu đề nhỏ "Tình trạng tồn kho" + chevron. Bên trái là **donut** (SVG) chia 4 đoạn theo màu: hết (destructive) / dưới mức (warning) / vượt mức (info) / bình thường (success); đoạn > 0 luôn thấy được (độ dài tối thiểu, như `StockOverviewBar`). Khe nhỏ giữa các đoạn, đầu đoạn bo tròn.
- Giữa donut: **% vật tư bình thường** (số to) + chữ nhỏ "ổn định". Bên phải: chú thích 4 dòng (chấm màu + nhãn + số) + dòng "N vật tư".
- Hiệu ứng: đoạn chạy vào khi có dữ liệu (reanimated); `useReducedMotion()` → vẽ ngay.
- Chạm thẻ → tab Tồn kho không lọc (`preset=all`, như bản cũ). Ẩn khi thiếu quyền tồn kho hoặc kho 0 vật tư.
- Thay cho `StockOverviewBar` trên Tổng quan (tab Tồn kho vẫn dùng thanh ngang).
- a11y: một phần tử, nhãn "Tình trạng tồn kho: 128 vật tư, 2 hết, 6 dưới mức, 3 vượt mức".

### 3. Thẻ "Hoạt động 7 ngày" — biểu đồ cột đôi

- **Số liệu mỗi ngày** = số phiếu **Đã xác nhận** (`status=CONFIRMED`) có **ngày lập** rơi vào ngày đó (API chỉ lọc theo ngày tạo: `startDate=endDate=<ngày>`). Hai chuỗi: Nhập và Xuất. Ghi chú dưới biểu đồ: "Phiếu đã nhập/xuất kho, theo ngày lập".
- 7 ngày = hôm nay − 6 … hôm nay theo giờ máy (cùng cách `timeRange('last7')`). Trục X: thứ viết tắt (T2…CN), cột hôm nay nhấn đậm nhãn. Trục Y: 2–3 vạch lưới mảnh, mốc tròn đẹp; không vẽ khung.
- Cột đôi mỗi ngày: Nhập (accent) và Xuất (một màu thứ hai từ theme, vd. info/teal), bo đầu cột, chú thích màu ở đầu thẻ.
- Đầu thẻ (mặc định): "Tuần này: **18** nhập · **12** xuất".
- **Tương tác kiểu Swift Charts:** chạm hoặc kéo ngang trên biểu đồ → đánh dấu một ngày (cột khác mờ đi + vạch dọc), dòng đầu thẻ đổi thành "T3, 10/11: **4** nhập · **2** xuất" + rung chọn nhẹ khi đổi ngày; thả tay / chạm ngoài → về dòng tổng tuần. Không điều hướng.
- Quyền: chuỗi Nhập chỉ khi `IMPORT_FORM_READ`, chuỗi Xuất chỉ khi `EXPORT_FORM_READ`; thiếu cả hai → ẩn thẻ; thiếu một → biểu đồ một chuỗi, chú thích/dòng tổng chỉ nhắc chuỗi còn lại.
- Dữ liệu: tối đa 14 request đếm (`size=1`, lấy `total`). Key mỗi ngày nằm dưới tiền tố `'list'` của phiếu (`[..., wh, 'list', { status: 'CONFIRMED', day, count: true }]`) để xác nhận/huỷ phiếu làm mới luôn. Sang ngày mới → key mới theo ngày.
- Đang tải: khung biểu đồ với cột xám nhạt (skeleton). Một vài ngày lỗi: các ngày đó vẽ "–" dưới trục, dòng tổng ghi "chưa đủ dữ liệu"; tất cả lỗi → thông báo lỗi nhỏ trong thẻ, kéo để thử lại.
- Hiệu ứng: cột mọc lên khi có dữ liệu; tôn trọng Giảm chuyển động.
- a11y: thẻ có nhãn tóm tắt ("Hoạt động 7 ngày: 18 phiếu nhập, 12 phiếu xuất"); mỗi cột/ngày có thể đọc bằng VoiceOver (accessible element theo ngày: "Thứ Ba 10/11: 4 nhập, 2 xuất").

## Thứ tự & khoảng cách

Chào + kho → lưới ô → donut → biểu đồ. Lề ngang 16, khoảng giữa ô 12, giữa khối ~20–24, tiêu đề nhóm kiểu `SectionHeader` hiện có. Hỗ trợ sáng/tối qua token theme; chữ co giãn theo cỡ chữ hệ thống (ô cao theo nội dung, không cắt số).

## Không làm

- Không thêm API backend; không biểu đồ khác ngoài 2 thẻ trên; không chọn khoảng thời gian (cố định 7 ngày); chạm cột không mở danh sách.

## Anti-goal

- Dashboard đẹp nhưng số lệch với danh sách khi chạm ô.
- Mở tab bị giật / chậm vì 14+ request: các request chạy song song, ô việc cần làm hiện số ngay khi có, không chờ biểu đồ.
- Hiệu ứng làm khó chịu người bật Giảm chuyển động; màu là kênh thông tin duy nhất (luôn có số / nhãn đi kèm).

## Các quyết định đã tự chốt (để bạn soát)

1. Đưa "Chờ duyệt xuất" lên vị trí ô thứ 2.
2. Icon SF + màu từng ô như bảng trên.
3. Donut thay thanh ngang trên Tổng quan; giữa vòng là % vật tư bình thường.
4. Màu chuỗi Xuất lấy từ token theme sẵn có (không thêm màu mới nếu theme đủ).
5. Ngày có request lỗi hiển thị "–", không coi là 0.

## Để builder tự quyết

Kích thước cụ thể donut/biểu đồ, cách tính mốc trục Y, cách gom 14 query (vd. `useQueries`), cấu trúc component, skeleton.

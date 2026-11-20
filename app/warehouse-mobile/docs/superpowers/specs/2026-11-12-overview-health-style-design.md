# Tổng quan kiểu "Sức khoẻ · Tóm tắt" + bộ lọc thời gian — thiết kế

Ngày: 2026-11-12 · Trạng thái: chờ duyệt · Local, không commit.
Mockup đã chọn: `.superpowers/brainstorm/72893-1794448428/content/dashboard-health.html` (người dùng: "thử theo hướng này").
Kế thừa cách tính số / quyền / làm mới của các spec Tổng quan 2026-11-11 (dashboard, money-expiry, money-expiry-visual) — trừ phần giao diện và kỳ thời gian thay ở đây.

## Mục đích

Bản hiện tại đúng số nhưng thô và đơn sơ, chỉ xem được "tháng này". Người dùng muốn dashboard theo kiểu app **Sức khoẻ (Health) · Tóm tắt** của Apple và **lọc theo thời gian**.

## Người dùng đã chốt

- Phong cách: Sức khoẻ · Tóm tắt.
- Bộ lọc: thanh đoạn **Ngày / Tuần / Tháng / Năm** toàn trang, có lùi về kỳ trước.
- Cấu trúc: **Tóm tắt gọn + màn chi tiết** (chạm thẻ → màn chi tiết có biểu đồ lớn + bộ lọc riêng).

## 1. Trang Tóm tắt (thay `OverviewScreen` hiện tại)

Trên → dưới:

1. Header tab giữ nguyên (tiêu đề lớn "Tổng quan" + nút kho bên phải). Dòng đầu nội dung là **dòng ngày** "THỨ NĂM, 12 THÁNG 11" (chữ nhỏ in hoa, muted), **thay lời chào** "Xin chào, …" (header native không cho chèn dòng ngày phía trên tiêu đề lớn như Health, nên đặt ngay dưới).
2. **Thanh đoạn** Ngày · Tuần · Tháng · Năm (`SegmentedControl` kiểu iOS — dùng component segmented sẵn có của app nếu có, không thì tự vẽ theo token). Mặc định **Tháng**. Lựa chọn giữ trong phiên (store), không lưu máy.
3. **Dòng kỳ**: `‹  Tháng 11 · 01–12/11  ›`. `‹` lùi một kỳ, `›` tiến (mờ + vô hiệu khi đang ở kỳ hiện tại). Nhãn: Ngày "Hôm nay" / "Thứ Ba, 10/11"; Tuần "Tuần này · 09–15/11" (tuần bắt đầu **thứ Hai**); Tháng "Tháng 11 · 01–12/11" (kỳ hiện tại tính tới hôm nay); Năm "Năm 2026".
4. **Nhóm "Cần chú ý"** (chỉ hiện khi có lô quá hạn hoặc sắp hết hạn): thẻ **Hạn dùng** kiểu Health — dòng đầu đỏ (icon cảnh báo + "Hạn dùng", phải "Hôm nay ›"), số to "1" + "lô quá hạn", bên phải "3 sắp hết hạn" (cam), dưới là **2 lô hết hạn sớm nhất** với viên đếm ngược. Chạm → sheet `/expiry-batches`. Thay banner + thẻ Hạn dùng hiện tại (bỏ `ExpiryBanner`, `ExpiryCard` cũ). Không theo bộ lọc thời gian. Chấm đỏ tab giữ nguyên.
5. **Nhóm "Tiền"** (tiêu đề phải ghi kỳ đang lọc), theo bộ lọc:
   - Thẻ **Chênh lệch nhập − xuất** (xanh lá): số to có dấu + đơn vị nhỏ; dưới là **thanh so sánh** Nhập (xanh) / Xuất (tím) tỉ lệ theo tiền, hai đầu ghi số đầy đủ. Chỉ khi đủ 2 quyền. Không chạm.
   - Hai thẻ cạnh nhau **Nhập kho** (xanh) / **Xuất kho** (tím): số to + đơn vị, **biểu đồ cột mini** theo cùng ô thời gian của kỳ (xem §3), dòng nhỏ "▲ 12% so tháng 10" (so kỳ trước cùng độ dài, tính tới cùng thời điểm nếu kỳ đang chạy; kỳ trước = 0 → "Tháng 10: 0 đ"). Chạm → màn chi tiết Nhập / Xuất.
   - Thẻ **Đang chờ xử lý** (cam, phải "Hiện tại"): số tiền + "14 phiếu nhập · 1 phiếu xuất". Không theo bộ lọc. Không chạm.
6. **Nhóm "Việc cần làm"**: lưới 2 cột 5 ô như hiện tại, đổi kiểu theo mockup (nhãn có icon màu ở trên, số to bo dưới, ô 0 nhạt). Hành vi chạm / preset giữ nguyên.
7. **Nhóm "Tồn kho"**: một thẻ "Tình trạng tồn kho" (xanh lá, phải "13 vật tư ›"): "69 % ổn định" + dòng "1 hết · 2 dưới mức · 1 vượt mức" bên trái, **vòng nhỏ** bên phải (dùng lại hình học donut hiện có). Chạm → tab Tồn kho (`preset=all`). Thay `StockDonutCard`.
8. **Nhóm "Hoạt động"** (theo bộ lọc): thẻ "Phiếu đã xác nhận" (teal): số phiếu to + "● 4 nhập · ● 1 xuất", biểu đồ cột đôi mini. Chạm → màn chi tiết Hoạt động.

Kiểu chung (theo mockup): thẻ nền `card`, bo ~12; **dòng đầu thẻ** = icon + tên nhóm màu nhóm (semibold 15) bên trái, kỳ / "›" muted bên phải; **số to** đậm 26–32 + **đơn vị nhỏ muted** tách riêng ("3,1" + "tr đ"); tiêu đề nhóm 22 đậm. Font hệ thống (không đặt fontFamily — luật repo).

**Tiền rút gọn**: chỉ rút gọn khi **≥ 1 triệu** ("3,1 tr đ", "1,25 tỷ đ"); dưới 1 triệu hiện đầy đủ ("4.440 đ", "850.000 đ") — bỏ kiểu "4,44 N đ". Màn chi tiết luôn hiện tổng đầy đủ.

## 2. Màn chi tiết (push trong Stack tab Tổng quan)

Route: `app/(tabs)/overview/[metric].tsx` với `metric ∈ import | export | activity`; tiêu đề nhỏ giữa ("Nhập kho" / "Xuất kho" / "Hoạt động"), nút back chỉ icon (khuôn `TabStackLayout`). Mở với kỳ + độ lùi đang chọn ở Tóm tắt; đổi trong chi tiết **không** đổi Tóm tắt.

- Thanh đoạn Ngày/Tuần/Tháng/Năm + dòng kỳ `‹ ›` như Tóm tắt.
- Chữ nhỏ in hoa "TỔNG" (Hoạt động: "SỐ PHIẾU"), **số to đầy đủ** ("3.104.400 đ" / "5 phiếu"), dòng phụ "1–12 thg 11, 2026 · 4 phiếu · ▲ 12% so tháng 10".
- **Biểu đồ cột lớn**: trục giá trị bên phải (2–4 vạch, `niceMax`), nhãn trục thời gian dưới (thưa bớt cho dễ đọc), **đường trung bình** đứt nét + nhãn "TB/ngày …" (Tháng/Tuần), "TB/giờ" (Ngày), "TB/tháng" (Năm). Chạm/kéo để xem từng cột (dùng lại cơ chế cử chỉ của biểu đồ Hoạt động hiện tại): dòng tổng đổi thành giá trị cột đó. Hoạt động: cột đôi nhập/xuất như biểu đồ hiện có.
- **Nổi bật**: một câu, vd. "Ngày nhập nhiều nhất là 06/11 với 2,1 tr đ — gấp 8 lần trung bình mỗi ngày." (ẩn khi kỳ không có phiếu).
- **Phiếu trong kỳ**: danh sách mọi phiếu `CONFIRMED` của kỳ (đã tải sẵn để cộng tiền), xếp theo **số tiền giảm dần** (Hoạt động: theo ngày mới nhất, gộp nhập + xuất có nhãn loại): mã phiếu (`Text code`), ngày · bên bán/người nhận, số tiền. Chạm → xem phiếu ở tab Nhập / Xuất (`/import/[formSlug]` / `/export/[formSlug]`). Danh sách dài → hiện 20 dòng đầu + "Xem thêm".
- Quyền: chi tiết Nhập cần `IMPORT_FORM_READ`, Xuất cần `EXPORT_FORM_READ`; Hoạt động hiện chuỗi có quyền. Mở deep link không quyền → về Tóm tắt.

## 3. Kỳ thời gian và dữ liệu

- `Period = 'day' | 'week' | 'month' | 'year'`, `offset` = số kỳ lùi (0 = kỳ hiện tại). Hàm thuần `periodRange(period, offset, now) → { startDate, endDate, label, buckets }` và `previousRange(...)` (kỳ trước cùng độ dài; kỳ đang chạy → cắt tới cùng thời điểm tương ứng).
- **Ô thời gian (bucket)**: Ngày → 24 giờ (theo giờ `createdAt`); Tuần → 7 ngày T2…CN; Tháng → từng ngày; Năm → 12 tháng.
- Dữ liệu: dùng **một nguồn** cho Tiền + Hoạt động: tải hết phiếu `CONFIRMED` trong kỳ (nhập + xuất, đã có `fetch*FormSum` — mở rộng trả thêm danh sách phiếu gọn `{slug, code, createdAt, amount, party}` và gom theo bucket ở client). Kỳ trước: tải tương tự (chỉ cần tổng). → mỗi lần đổi kỳ tối đa 4 nhóm request, **bỏ 14 request đếm theo ngày** của biểu đồ cũ.
- Vượt trần 5.000 phiếu/nhóm (dễ xảy ra với Năm): số và biểu đồ của nhóm đó hiện "–" + chú thích "quá nhiều phiếu để tính" — không hiện số thiếu (giữ luật cũ).
- Key cache nằm dưới tiền tố `'list'` của phiếu (để xác nhận/huỷ phiếu làm mới), có `period`/khoảng ngày trong key; giữ kéo-làm-mới + làm-mới-khi-focus/foreground.
- Đang tải: skeleton đúng chỗ số / cột. Lỗi: "!" như cũ. Đổi kỳ: giữ khung, số mờ đi tới khi có dữ liệu mới (không nhảy về trống) — _đây là `placeholderData` theo kỳ, KHÔNG giữ dữ liệu khi đổi kho_.

## Không làm

Giá trị tồn kho; khoảng ngày tự chọn bằng lịch; ghim/sắp xếp thẻ như Health; thông báo đẩy; font SF Rounded.

## Anti-goal

Đổi kỳ mà số lẫn kỳ cũ không báo; một kỳ lớn làm treo màn (tải song song, ô Việc cần làm / Tồn kho không chờ); số tiền thiếu mà trông như đủ.

## Các quyết định đã tự chốt (để bạn soát)

1. Dòng ngày thay lời chào "Xin chào, …" (tên kho đã ở nút kho).
2. Mặc định kỳ **Tháng**; nhớ trong phiên, không lưu máy.
3. Tuần bắt đầu thứ Hai.
4. Bỏ banner hạn dùng; thẻ Hạn dùng lên nhóm "Cần chú ý" đầu trang, ẩn nhóm khi không có gì cần chú ý; chấm đỏ tab giữ.
5. Tiền dưới 1 triệu hiện đầy đủ.
6. Danh sách phiếu trong chi tiết xếp theo tiền giảm dần, 20 dòng + "Xem thêm".
7. Biểu đồ Hoạt động dùng chung dữ liệu với Tiền (bỏ đếm theo ngày) — số phiếu = phiếu `CONFIRMED` lập trong kỳ.

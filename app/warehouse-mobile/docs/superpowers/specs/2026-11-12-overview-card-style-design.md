# Tổng quan: kiểu card theo app tham khảo — thiết kế

Ngày: 2026-11-12 · Trạng thái: chờ duyệt · Local, không commit.
Kế thừa: `2026-11-12-overview-health-style-design.md` (bố cục, dữ liệu, kỳ, quyền giữ nguyên). Chỉ đổi **kiểu card** và thêm **hàng hành động** trong card.

## Tham khảo

Ảnh người dùng gửi (app focus/tasks, nền tối): card bo góc lớn, lề trong rộng; đầu card = icon đơn sắc trong **vòng tròn xám** + nhãn xám; **dòng chính rất to, đậm**; dòng phụ xám; hàng "icon + chữ + ›"; nút viên tô nhạt ("Move all"); liên kết "See all ›" xám.

## Người dùng đã chốt

- Đầu card **trung tính** (icon đơn sắc trong vòng xám, nhãn xám); màu chỉ cho số liệu / biểu đồ / cảnh báo. Card Hạn dùng giữ đỏ.
- Phạm vi: **tab Tổng quan + 3 màn chi tiết**; các tab khác giữ nguyên.
- **Có hàng hành động** ở card phù hợp.

## Kiểu card chung (`HealthCard` → đổi thành kiểu mới, giữ tên hoặc đổi `DashCard`)

- Bo góc **24**, lề trong **20** (ngang) / 18 (dọc), nền `card`, khoảng giữa card **14**, nền trang `grouped`.
- **Đầu card**: vòng tròn **40pt** nền `fill`, icon 20 màu `foreground` (đơn sắc); nhãn 17 `mutedForeground` medium, cách icon 12. Phải (tuỳ chọn): chữ kỳ muted hoặc nút tròn 36 nền `fill` (vd. "+" của mẫu — không dùng ở đây) hoặc `›`.
  - Biến thể cảnh báo (Hạn dùng): vòng `destructiveSoft`, icon `destructive`.
- **Dòng chính**: 30–34 bold `foreground` (số + đơn vị: đơn vị cùng dòng, nhỏ hơn, muted). Dòng phụ 15 muted.
- **Hàng** (`CardRow`): cao ≥ 44, icon nhỏ 20 (màu trạng thái nếu có) + chữ 17 + `›` muted; chạm có phản hồi `rowPressed`.
- **Chân card**: trái = **nút viên** (nền `fill` hoặc `accentSoft`, chữ `accentText` semibold 17, icon nhỏ); phải = **"Xem tất cả ›"** muted. Mỗi nút ≥ 44pt.
- Nhóm 2 card cạnh nhau (Nhập/Xuất): cùng kiểu, vòng icon 32, dòng chính 26.

## Áp vào từng card

| Card                                    | Đầu                                 | Dòng chính / phụ                                                      | Hàng                                                                                                                                                   | Chân                                                                       |
| --------------------------------------- | ----------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Hạn dùng (Cần chú ý)                    | ⚠ đỏ, "Hạn dùng"                    | "1 lô quá hạn" / "và 3 lô sắp hết hạn trong 60 ngày"                  | "● 1 lô đã quá hạn ›" (đỏ) → sheet `focus=expired`; "● 3 lô sắp hết hạn ›" (cam) → `focus=soon` (hàng 0 ẩn)                                            | phải "Xem tất cả ›" → sheet                                                |
| Chênh lệch                              | ⇅ "Chênh lệch nhập − xuất", phải kỳ | "+3,1 tr đ"                                                           | —                                                                                                                                                      | thanh so sánh như hiện tại                                                 |
| Nhập kho / Xuất kho (2 card)            | ⬇ / ⬆, phải `›`                     | "3,1 tr đ" / "▲ 12% so tháng 10"                                      | —                                                                                                                                                      | cột mini; chạm card → chi tiết                                             |
| Đang chờ xử lý                          | ◷ "Đang chờ xử lý", phải "Hiện tại" | "3,08 tr đ" / "14 phiếu nhập · 1 phiếu xuất"                          | —                                                                                                                                                      | —                                                                          |
| Việc cần làm (**gộp 5 ô thành 1 card**) | ☑ "Việc cần làm"                    | "19 việc đang chờ" (tổng các mục > 0; 0 → "Không có việc tồn")        | 5 hàng: icon màu trạng thái + "14 phiếu chờ kiểm hàng ›"…; hàng 0 vẫn hiện, chữ muted; testID `todo-<key>`, `todo-<key>-count`, `todo-<key>-error` giữ | —                                                                          |
| Tồn kho                                 | ◎ "Tình trạng tồn kho"              | "69% ổn định" / "1 hết · 2 dưới mức · 1 vượt mức" + vòng nhỏ bên phải | —                                                                                                                                                      | phải "Xem tồn kho ›" → tab Tồn kho (`preset=all`, testID `overview-stock`) |
| Hoạt động                               | ▤ "Phiếu đã xác nhận", phải kỳ      | "5 phiếu" / chú thích màu                                             | —                                                                                                                                                      | cột mini; trái nút viên "Chi tiết" → chi tiết Hoạt động                    |

Màn chi tiết: card "Nổi bật" và "Phiếu trong kỳ" theo kiểu mới (đầu card trung tính; danh sách là các `CardRow` có số tiền thay `›`; "Xem thêm" thành nút viên ở chân card). Biểu đồ lớn giữ trên nền trang.

## Không làm

Đổi tab khác; ảnh minh hoạ đầu trang như app mẫu; nút nổi "Start Focus"; đổi dữ liệu / quyền / kỳ.

## Các quyết định đã tự chốt (để bạn soát)

1. Gộp lưới 5 ô "Việc cần làm" thành **một card có 5 hàng** (đúng kiểu "4 overdue tasks ›" của mẫu); dòng chính là tổng việc đang chờ.
2. Hàng Hạn dùng bằng 0 thì ẩn (khác hàng Việc cần làm vẫn hiện mờ) — card cảnh báo chỉ nói cái đang có.
3. Không lặp hàng "chờ kiểm / chờ duyệt" trong card Đang chờ xử lý (đã có ở Việc cần làm).
4. Giữ mọi testID cũ để test hành vi và routing không phải viết lại.

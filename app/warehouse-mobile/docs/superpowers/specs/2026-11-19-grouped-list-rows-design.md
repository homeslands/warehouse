# Dòng danh sách kiểu nhóm iOS (Nhập / Xuất / Tồn kho) — thiết kế ngắn

## Vì sao

Người dùng thấy các dòng danh sách "quê, chưa đủ Apple style": vòng icon màu 40pt to, thẻ rời hở 10pt,
thứ bậc chữ chưa rõ, viên nhãn + mũi tên nặng nề.

## Mục tiêu / không làm

- Làm: danh sách phiếu nhập, phiếu xuất, tồn kho + skeleton của chúng.
- Không làm: danh mục (`CatalogRow` vẫn `ListItemCard`), màn chi tiết, wizard.

## Hướng (đã chọn)

- A. **Nhóm inset liền (kiểu Cài đặt/Ví)** — ĐÃ CHỌN.
- B. Kiểu Mail phẳng tràn ngang — bỏ.
- C. Giữ thẻ rời làm mịn — bỏ (vẫn là thẻ rời).

## Thiết kế

- Khuôn dùng chung mới `GroupedListRow` (shared/ui): mỗi item của `SectionList` là một đoạn của khối nhóm;
  dòng đầu bo góc trên, dòng cuối bo góc dưới (`radius.groupLarge`), nền `card`; giữa các dòng đường kẻ
  hairline `separator` thụt tới chỗ chữ bắt đầu (vẽ trên nền card). Chạm: nền `rowPressed`. Không `›`.
- Đầu dòng: icon 20pt tô màu trạng thái (fg của tone), không nền, cột 24.
- Chữ: dòng 1 tiêu đề 17 đậm + giá trị phải 17; dòng 2 phụ 15 xám + phụ phải 15 xám. Một dòng mỗi chữ.
- Phiếu nhập: mã · tiền / "HĐ · PO · người tạo" · giờ. Phiếu xuất: như cũ, không phải Bán thì không có tiền.
- Tồn kho: tên · số tồn (tô màu theo mức: hết đỏ, thiếu cam, vượt xanh; bình thường mặc định) /
  "mã · loại · giữ n" · đơn vị. Bỏ `LevelPill` khỏi dòng; nhãn a11y vẫn đọc chữ đầy đủ.
- Skeleton theo cùng khuôn nhóm.
- Giữ testID hiện có (`import-row`, `import-tile-<status>`, `stock-tile-<level>`…) để test cũ chạy.

## Để người làm tự quyết

Khoảng cách giữa các nhóm, đệm trong dòng (≈ 12 dọc / 16 ngang), màu cụ thể lấy từ tone hiện có.

## Bản 3 (2026-11-19, tham khảo danh sách giao dịch Zalopay + HIG) — THAY các mục trên

Người dùng chọn: nền phẳng trắng; icon chỉ phiếu xuất theo loại; trạng thái luôn hiện ở cột phải.

- Màn `Screen tone="plain"` (nền `background`). Dòng phẳng tràn ngang (bù lề 16 của danh sách), không khối
  bo; đường kẻ hairline GIỮA các dòng cùng nhóm, thụt tới chỗ chữ, chạy tới mép phải. Chạm: `rowPressed`.
- Dòng dựng theo HÀNG (`RowLine`): mỗi hàng [chữ trái co giãn][chữ phải], nên cột phải thẳng từng hàng.
- Phiếu nhập: [mã 17 đậm, cắt giữa | tiền 17 đậm] / [giờ · người tạo | trạng thái màu] / [HĐ · PO].
- Phiếu xuất: ô icon 40 bo 10 theo LOẠI (Bán giỏ hàng xanh lá, Sản xuất nhà máy cam, Chuyển kho ⇄ xanh
  dương, Huỷ bỏ thùng rác đỏ, Khác hộp xám) + như phiếu nhập; hàng 3 "Loại · người nhận"; không phải Bán thì
  không tiền (trạng thái vẫn ở hàng 2).
- Tồn kho: [tên 17 đậm | số tồn 17 đậm màu mức] / [mã · loại · giữ n | đơn vị].
- Tiêu đề nhóm: chữ 20 đậm + dòng phụ 13 xám đếm số mục ĐANG HIỆN ("3 phiếu", "8 vật tư") — không cộng
  tiền vì danh sách tải theo trang.

## Bản 4 (2026-11-19, CHỐT) — B cho Nhập/Xuất, C cho Tồn kho, phối icon trung tính

Chọn sau canvas https://claude.ai/artifact/NgaGSUh1dkqt5EUhh9ynm7 (bảng "Trau chuốt" + "So sánh 3 cách phối").

- Gom theo THÁNG (`groupFormsByMonth`), ngày-giờ trong dòng ("HH:mm · dd/MM"); tiêu đề tháng 20 đậm + "n phiếu".
- Ô icon 44 bo 12 trung tính cố định; hình = loại (phiếu xuất), "hộp +" (phiếu nhập); màu chỉ cho trạng thái.
- Trạng thái: chấm + chữ (`RowStatus`), chỉ khi "Tất cả". Tiền 0 đ xám, huỷ xám gạch ngang.
- Tồn kho: không icon; thanh mức tồn có vạch min/max + câu gợi ý; màu chỉ khi có vấn đề.
- Giữ nguyên: SegmentedControl lọc trạng thái (canvas vẽ tab gạch chân — chưa đổi), thanh tổng quan tồn kho.

## Bản 5 (2026-11-19)

- Lọc trạng thái Nhập/Xuất: `UnderlineTabs` (tab gạch chân) thay `SegmentedControl`.
- Trạng thái trên dòng: nhãn nền nhạt (`RowStatus`) thay chấm + chữ (chưa đủ nhận diện).
- Tồn kho: chip [Tất cả] [Thiếu] [Vượt] thay thanh tổng quan; thanh trong dòng → thước mini (vùng an toàn
  tối thiểu–tối đa + chấm ở số tồn), cùng ngôn ngữ `LevelGauge`. Lý do: hai vạch không nhãn, thang riêng từng
  dòng dễ bị so độ dài sai, hai loại thanh khác nghĩa trên một màn.

## Bản 6 (2026-11-19)

- Lọc trạng thái quay về `SegmentedControl` kiểu iOS (bỏ `UnderlineTabs`).
- Nhãn trạng thái: nền ĐẶC + chữ trắng (`badge*` tokens, ≥4.5:1).

## Bản 7 (2026-11-19)

- Trạng thái: CHỈ chữ 13 medium nghiêng, màu tươi còn AA (`status*` tokens); bỏ nhãn nền đặc / `badge*`.

## Bản 8 (2026-11-19, CHỐT Tồn kho) — phương án 1 trau chuốt

- Một điểm màu: số tồn + chấm màu mức; rãnh / vùng an toàn (`gaugeTrack` / `gaugeBand`) / câu gợi ý xám.
- Thước CHỈ ở dòng cần chú ý, ≤58% bề ngang; câu gợi ý có đơn vị căn phải; dòng bình thường 2 hàng.
- "168 bao" một hàng; "giữ n" ở cột phải hàng 2; tiêu đề "Cần chú ý" ghi "n hết · n thiếu · n vượt"; chấm chip "Thiếu" đỏ.

## Bản 9 (2026-11-19, CHỐT Tồn kho cuối) — khuôn A + cách hiển thị tồn của B

- Dòng tồn cùng khuôn dòng phiếu: ô "hộp" trung tính, số tồn đen, mức tồn chữ nghiêng màu ở hàng 2, hàng 3 "Tối thiểu · Tối đa" bằng chữ + "giữ n".
- BỎ thước mini trên dòng (khó đọc nếu chưa học); bỏ token `gaugeTrack`/`gaugeBand`, chuỗi `hint*` → `levelShort`/`levelOver`.

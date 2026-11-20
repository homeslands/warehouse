# Ô "Người nhận" kiểu chọn (bước 1 phiếu xuất) — thiết kế

Ngày: 2026-11-11 · Trạng thái: chờ duyệt · Local, không commit.

## Mục đích

Ô Người nhận hiện là ô gõ chữ kèm gợi ý xổ dưới dòng. Người dùng muốn nó **chọn giống ô "Loại"** cho nhất quán và nhanh, nhất là khi Chuyển kho (chọn kho đích).

## Hành vi

- Dòng hiển thị giống dòng Loại: giá trị chữ accent + `⌄` bên phải; chưa có giá trị → chữ placeholder "Chọn" (muted) + `⌄`.
- Cách mở menu **giống hệt Loại**: iOS `chooseAction` (danh sách + "Đóng"); Android bung hàng viên `OptionPill` ngay dưới dòng (Alert chỉ 3 nút). Không UIMenu.
- **Loại = Chuyển kho:** các lựa chọn = các kho chọn được trừ kho hiện tại (cùng nguồn đang dùng cho gợi ý kho: ADMIN+ mọi kho trong store kho, còn lại kho của mình). Nhãn lựa chọn: "Tên kho (MÃ)". Chọn → ghi vào `receiver` **đúng chuỗi định dạng đang dùng hiện nay** cho gợi ý kho (vd. "Kho: KHO5 · Kho tàu") để dữ liệu cũ/backend không đổi. Không có ô gõ tự do.
- **Loại khác:** các lựa chọn = người nhận gần đây của kho (`useRecentReceivers`, tối đa 8, mới nhất trước) + mục cuối **"Nhập tên khác…"**. Chọn tên → ghi `receiver`. "Nhập tên khác…" → dòng chuyển sang ô gõ (dùng lại ô chữ hiện có, ≤ 255 ký tự, focus + bàn phím). Chưa có người nhận gần đây → chạm dòng vào thẳng ô gõ. Đang có giá trị gõ tay → hiện như giá trị bình thường; chạm lại mở menu (giá trị hiện tại đứng đầu, có ✓).
- Giá trị đang chọn có dấu ✓ trong menu (iOS: tiền tố "✓ "; Android: viên đang chọn tô đậm như Loại).
- Bắt buộc như cũ: lỗi "chưa có người nhận" hiện theo đúng luật hiện tại (sau rời ô / "Tới" / `revealErrors`); "Tới" vào ô Người nhận khi thiếu → mở menu (Chuyển kho) hoặc ô gõ (loại khác, không có gợi ý).
- Đổi Loại: giữ hành vi hiện tại của bản nháp. _(Đề xuất của mình: đổi sang/ra khỏi Chuyển kho mà giá trị không còn hợp lệ với loại mới — vd. tên người ở Chuyển kho — thì xoá để buộc chọn lại; builder kiểm hiện trạng, nếu đã xử lý thì giữ.)_
- `disabled` (đang ghi): không mở menu, như Loại. Rung chọn (`haptics.selection`) khi chọn, như Loại.

## Không làm

Không đổi backend, không đổi định dạng chuỗi `receiver`, không thêm tìm kiếm trong menu.

## Để builder quyết

Cách tách component (`ReceiverField` viết lại hay thêm `ReceiverPicker`), xoá phần gợi ý xổ dưới dòng không còn dùng, test.

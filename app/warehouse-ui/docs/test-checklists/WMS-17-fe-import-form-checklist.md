# WMS-17 FE — Phiếu nhập kho: checklist test tay

Môi trường: `VITE_API_PROXY_TARGET=https://sandbox.warehouse.cmsiot.net`, `npm run dev`. Ba tài khoản: ADMIN,
MANAGER, SUPERVISOR (thuộc ít nhất 1 kho). Bật cho MANAGER ở `/permissions`: `IMPORT_FORM_CREATE`,
`IMPORT_FORM_UPDATE_DRAFT` (xem CLAUDE.md → Nợ kỹ thuật → ma trận quyền seed).

## Danh sách

- [ ] Vào menu "Phiếu nhập" → tự chọn kho, URL có `?warehouse=`; F5 giữ kho; copy link sang tab ẩn danh mở đúng kho.
- [ ] Đổi kho → về trang 1; lọc trạng thái; xoá bộ lọc.
- [ ] Kho ngừng hoạt động → nút Tạo khoá, có dòng lý do.
- [ ] Tài khoản không thuộc kho nào → câu "Bạn chưa thuộc kho nào…".

## Tạo (sheet rộng mở ngay trên danh sách)

- [ ] Bấm "Tạo phiếu" → sheet rộng ~1024px (full width dưới 640px), tiêu đề "Tạo phiếu nhập · <kho>", mở ở bước ① (chân sheet: Huỷ / Tiếp tục); URL không đổi.
- [ ] Mã gợi ý `PN-YYYYMMDD-HHmm`; sửa thành mã trùng → lỗi tại ô Mã phiếu.
- [ ] Chọn vật tư → đơn vị gốc, "Tồn: …"; đổi sang đơn vị quy đổi → "= … <đv gốc>"; đổi vật tư → đơn vị về gốc.
- [ ] Hai dòng cùng vật tư + đơn vị → lỗi ở dòng 2; khác đơn vị → được.
- [ ] Thành tiền / tổng đúng với số lẻ (0,1 × 3 = 0,3).
- [ ] Đính kèm file < 10 MB → hiện tên; > 10 MB → lỗi; gỡ file.
- [ ] Đi tới bước ③ → Lưu nháp → sheet đóng, ở lại danh sách, phiếu mới nằm đầu bảng.
- [ ] Đang nhập dở bấm Huỷ / × / Esc / bấm ra ngoài → hỏi "Bỏ thay đổi chưa lưu?"; đóng / F5 tab → hộp của trình duyệt. Mở lại sheet → form trống. (F5 / Back khi sheet đang mở làm mất phần đang nhập, như mọi sheet khác — không có URL riêng cho form.)

## Sửa / Xoá

- [ ] "Sửa" (menu ⋯ ở danh sách, nút ở trang chi tiết) → sheet sửa tự tải chi tiết (có khung chờ), lưu xong sheet đóng và ở lại đúng trang; nút "Lưu" khoá khi chưa đổi gì.
- [ ] SUPERVISOR: phiếu mình sửa / xoá được; phiếu người khác không thấy nút.
- [ ] Hai tab cùng sửa một phiếu: tab lưu sau → toast "vừa bị người khác thay đổi", sheet đóng, danh sách / chi tiết tải lại dữ liệu mới.
- [ ] Gỡ file / xoá ghi chú rồi lưu → giá trị cũ mất thật (F5 kiểm lại).
- [ ] Xoá nháp → về danh sách; tạo lại mã vừa xoá → lỗi "mã đã dùng cho một phiếu đã xoá".

## Xác nhận / Huỷ

- [ ] MANAGER xác nhận → trạng thái Đã xác nhận, người xác nhận đúng; tồn vật tư tăng đúng `baseQuantity` (xem lịch sử tồn ở swagger).
- [ ] Huỷ → Đã huỷ, tồn không đổi, hiện "Người huỷ".
- [ ] Phiếu Đã xác nhận / Đã huỷ: không còn Sửa / Xoá / Xác nhận / Huỷ, kể cả ADMIN.

## In

- [ ] In phiếu Đã xác nhận: chỉ có khung phiếu (không sidebar / header), bảng dòng, ô ký.
- [ ] In phiếu Nháp / Đã huỷ: có nhãn "… — chưa có giá trị nhập kho".

## Giao diện

- [ ] Chrome 320 / 768 / 1024 / 1400px, sidebar mở / thu gọn: chân trang form không đè nội dung, không cuộn ngang trang.
- [ ] Dark mode; tiếng Anh.

## Thêm vật tư vào kho từ phiếu
- [ ] Mở ô vật tư của một dòng, gõ tên vật tư chưa có ở kho → cuối danh sách có "＋ Thêm vật tư vào kho…" → hộp mở, ô tìm có sẵn chữ.
- [ ] Vật tư có trong danh mục → "Gắn vào kho" → hộp đóng, dòng đó được chọn vật tư + đơn vị gốc, có hiện "Tồn: 0 …".
- [ ] Tạo vật tư mới (mã, tên, loại, đơn vị gốc) không chọn NCC → dòng được chọn; mở màn Vật tư thấy vật tư mới.
- [ ] Tạo vật tư mới có chọn NCC → dòng phiếu sau khi lưu có NCC đó.
- [ ] Mã trùng → lỗi tại ô Mã trong hộp.
- [ ] Đăng nhập MANAGER (seed mặc định) → vẫn tìm được, nút "Gắn vào kho" / "Tạo và gắn vào kho" khoá kèm lý do.
- [ ] Bỏ phiếu sau khi gắn → vật tư vẫn ở kho (màn tạo phiếu mới thấy vật tư trong ô chọn).

## Luồng cho người mới (bên bán, kiểm tra, lưu & xác nhận)
- [ ] Tài khoản có `SUPPLIER_READ`: ô "Bên bán" ở đầu phiếu bắt buộc, bỏ trống → lỗi tại ô, không lưu được. Tài khoản thiếu quyền → ô ẩn, vẫn tạo được phiếu.
- [ ] Đổi bên bán ở đầu phiếu khi có dòng đã đổi bên bán riêng → dòng đổi riêng giữ nguyên, dòng theo đầu phiếu đổi theo; dòng đặt lại đúng bên bán đầu phiếu thì quay về "theo đầu phiếu".
- [ ] Mở một nháp cũ (tạo trước khi có bên bán) → bên bán đầu phiếu được suy từ các dòng; lưu lại không lỗi.
- [ ] Ô chọn vật tư: gõ mã / tên của vật tư nằm ngoài 100 vật tư đầu của kho → vẫn tìm thấy; có 2 nhóm "Hàng thường mua của …" và "Vật tư khác"; có trạng thái đang tải.
- [ ] Bước ③ "Kiểm tra & lưu" hiện trang Kiểm tra trong sheet; đủ 4 loại cảnh báo (giá lệch, số lượng bất thường, tồn vượt max, dòng thiếu/trùng) hiện đúng và KHÔNG chặn lưu. Tồn vượt max chỉ hiện khi BE trả `effectiveMaximumInventory` (hiện chưa có → im lặng).
- [ ] MANAGER: chân sheet ở bước ③ có "Lưu nháp" và "Lưu & xác nhận"; "Lưu & xác nhận" → phiếu Đã xác nhận, tồn tăng.
- [ ] SUPERVISOR (không có `IMPORT_FORM_CONFIRM`): chỉ có "Lưu nháp"; sheet sửa không có nút "Lưu & xác nhận".
- [ ] Sửa nháp: "Lưu" lưu thẳng; "Lưu & xác nhận" khi chưa đổi gì → xác nhận luôn; khi đã đổi → lưu rồi xác nhận.
- [ ] Xác nhận lỗi sau khi đã lưu (vd. hai tab, hoặc BE từ chối) → toast cảnh báo "đã lưu nhưng chưa xác nhận", sheet đóng, phiếu vẫn là Nháp.
- [ ] Toast sau khi tạo ngắn gọn ("Đã tạo phiếu PN-…" / "Đã tạo và xác nhận PN-…") với một nút "Xem" (mở chi tiết); xác nhận lỗi → "Đã lưu PN-…, chưa xác nhận", lý do ở dòng phụ; không bị hiện toast thành công hai lần.
- [ ] Hộp thêm vật tư mở từ dòng đã chọn bên bán: tab "Tạo vật tư mới" chọn sẵn NCC đó (chỉ khi có quyền gắn NCC); tạo xong dòng được chọn.

## Wizard 3 bước (① Thông tin phiếu → ② Chi tiết vật tư → ③ Kiểm tra & lưu)
- [ ] Tạo: mỗi lúc chỉ thấy một bước; dải bước tô đậm đúng bước đang xem; ①/② đổi thành ✓ khi đủ, ② kèm "· n dòng".
- [ ] Tạo: Tiếp tục khi ① thiếu số HĐ (hoặc bên bán) → ở lại ①, lỗi tại ô, ô đó có focus. Sửa xong rồi Tiếp tục → ② KHÔNG có lỗi "Chọn vật tư" ở dòng trống.
- [ ] Tạo: bấm thẳng ③ trên dải bước khi ① / ② chưa đủ → dừng ở bước sai đầu tiên, có lỗi. Lùi (Quay lại, "sửa" ở dòng tóm tắt, bước trước trên dải) luôn được.
- [ ] Đổi bước → vùng nội dung cuộn lên đầu, focus ở tiêu đề bước (bàn phím / trình đọc màn hình biết đã sang bước mới).
- [ ] ② có dòng tóm tắt "Mua của <bên bán> · HĐ … · <ngày>" + "sửa" (về ①); thiếu quyền chọn NCC thì không có phần "Mua của".
- [ ] (Review Focus 1) Đang upload chứng từ ở ① → Tiếp tục khoá, bấm ② trên dải cũng không sang; upload xong thì sang được.
- [ ] (Review Focus 2) Tạo, ở ③ lưu với mã phiếu trùng → tự về ①, lỗi tại ô "Mã phiếu", ô đó có focus, sheet vẫn mở.
- [ ] (Review Focus 3) Nhập dòng ở ②, về ① đổi ghi chú / đính kèm file, Tiếp tục → dòng còn nguyên vật tư / số lượng / đơn giá; quay lại ① file vẫn còn.
- [ ] (Review Focus 4) Enter trong ô Số hoá đơn ở ① → sang ② (không tạo phiếu); Enter ở ② → sang ③; Enter ở ③ khi tạo → không lưu gì.
- [ ] (Review Focus 5) Đang ở ③ đóng sheet rồi mở lại → tạo bắt đầu ở ①, sửa bắt đầu ở ②.
- [ ] ③: tóm tắt, "Cần xem lại (n)" với "sửa" (về ②, focus Đơn giá nếu = 0, không thì Số lượng), bảng dòng chỉ xem có tên vật tư + SL + mã đơn vị — kể cả vật tư vừa thêm từ hộp "Thêm vật tư vào kho".
- [ ] ③ khi tạo: bấm Lưu nháp / Lưu & xác nhận → nút chính đổi thành "Đang lưu...", mọi nút khoá, Esc / × không đóng.
- [ ] Sửa nháp: mở ở ②; chân sheet ở MỌI bước là Huỷ · Lưu & xác nhận (nếu có quyền) · Lưu, Tổng bên trái; Enter ở ① / ② = Lưu.
- [ ] Sửa nháp: lỗi nằm ở bước đang ẩn (vd nháp cũ mà mọi dòng không có NCC, tài khoản có `SUPPLIER_READ`: đang ở ② bấm "Lưu & xác nhận") → tự chuyển tới ①, lỗi + focus tại ô Bên bán, không gửi gì.
- [ ] Sửa nháp: bấm ③ trên dải → trang Kiểm tra, không lưu gì cho tới khi bấm Lưu.
- [ ] Chân sheet ở 390px (Chrome DevTools, iPhone 12) mỗi bước, cả tạo và sửa: Tổng một hàng riêng, các nút không đè nhau / không tràn ngang.

## Ô xổ vật tư rộng + hộp "Chọn nhiều vật tư"
- [ ] Ô vật tư của một dòng: danh sách mở ra rộng bằng cả bảng dòng (mép trái và phải trùng bảng; ở 390–720px rộng bằng thẻ dòng), cao tối đa ~60% màn hình; mỗi mục có mã đậm · tên đầy đủ (tên dài xuống dòng, không bị cắt "…"), "Tồn: …" + mã đơn vị gốc, các mã đơn vị. Ở 1440px các cột tồn / đơn vị thẳng hàng giữa các mục; ở 720px trở xuống tồn / đơn vị xuống dòng dưới tên.
- [ ] Thêm vài dòng cho tới khi dòng cuối sát chân sheet → mở ô vật tư của dòng cuối: danh sách không tràn ra ngoài màn hình (lật lên trên hoặc cuộn được bên trong), vẫn rộng bằng bảng; vẫn còn 2 nhóm "Hàng thường mua của …" / "Vật tư khác" và "＋ Thêm vật tư vào kho…".
- [ ] Nút "Chọn nhiều vật tư" cạnh "Thêm dòng" → hộp "Chọn vật tư": ô tìm + bảng ô tick · mã · tên · tồn · đơn vị · NCC, nhóm theo bên bán đầu phiếu. Gõ mã / tên vật tư ngoài 100 vật tư đầu → tìm thấy (phía BE), có "Đang tìm…".
- [ ] Vật tư đã có trong phiếu (kể cả ở đơn vị khác) hiện "đã có", không tick được; vật tư chưa có đơn vị gốc hiện "chưa có đơn vị gốc", không tick được.
- [ ] Tick 3 vật tư → nút "Thêm 3 dòng" → hộp đóng, mỗi vật tư một dòng với đơn vị gốc, SL / đơn giá trống, bên bán theo đầu phiếu; con trỏ ở ô Số lượng của dòng mới đầu tiên.
- [ ] Phiếu có dòng trống hẳn ở giữa (chưa chọn gì) → vật tư chọn từ hộp lấp dòng trống đó trước rồi mới thêm dòng cuối. Dòng đã gõ SL / đơn giá / ghi chú nhưng chưa chọn vật tư → KHÔNG bị lấp, giữ nguyên.
- [ ] Huỷ hộp → con trỏ về nút "Chọn nhiều vật tư"; mở lại → không còn ô nào được tick, ô tìm trống. Tick một vật tư, đổi từ khoá cho nó khuất rồi "Thêm" → vật tư đó vẫn thành dòng.
- [ ] Phiếu còn ít chỗ (vd 198 dòng có vật tư): hộp hiện "Phiếu tối đa 200 dòng — còn chọn được 2", tick 2 → các ô còn lại khoá, câu đổi thành "còn chọn được 0"; bỏ tick → mở lại. Đủ 200 dòng có vật tư → không còn nút "Chọn nhiều vật tư".
- [ ] Footer "＋ Thêm vật tư vào kho…" trong hộp → tạo / gắn vật tư → vật tư đó thành dòng ngay, hộp chọn vẫn mở và giữ các ô đã tick.
- [ ] Hộp ở 1440px: bảng 5 cột, số tồn dài (vd 98.765.432,123456) nằm trọn một dòng, không gãy giữa chữ số; ở 720px / 390px: tồn / đơn vị / NCC xuống dòng dưới tên kèm nhãn "Tồn: / Đơn vị: / NCC:", không cuộn ngang. Vật tư nhiều NCC hiện 2 tên + "+N", rê chuột thấy đủ tên.

## Ô tìm danh sách phiếu nhập
- [ ] Ô "Tìm theo" (Mã phiếu / Số hoá đơn / Số PO) đứng cạnh ô tìm; placeholder đổi theo lựa chọn. Gõ "hd-0001" chọn Số hoá đơn → chỉ tìm theo số hoá đơn; đổi sang Mã phiếu → chữ vẫn còn, tìm "HD-0001" theo mã phiếu, về trang 1.
- [ ] "#$%" theo Mã phiếu → không có request, bảng trống với "Không có phiếu nào khớp bộ lọc."; theo Số hoá đơn thì vẫn tìm bình thường. Dán 70 ký tự vào Số hoá đơn → không lỗi (chỉ 64 ký tự đầu được dùng).
- [ ] Mở `?search=x&searchBy=invoiceCode` → ô tìm có "x", "Tìm theo" là Số hoá đơn. "Xoá bộ lọc" KHÔNG xoá chữ tìm lẫn "Tìm theo" (và giữ kho); nút chỉ hiện khi có bộ lọc khác đang bật — cần URL có thêm `status=DRAFT` (hoặc ngày / người) mới thấy nút.
- [ ] Thanh công cụ ở 1440 / 720 / 390px: ô "Tìm theo" + ô tìm cùng một hàng, không tràn ngang; chữ tìm rất dài không đẩy nút Tạo phiếu.
## Lọc Người lập / Người xác nhận
- [ ] Kho hiện ở đầu trang ("Kho: <mã · tên> ⌄", cạnh tiêu đề; mobile xuống hàng dưới tiêu đề), KHÔNG nằm trong thanh lọc / popover "Bộ lọc"; tên kho rất dài bị cắt "…" và rê chuột thấy đủ tên. Đổi kho vẫn đổi `?warehouse=`, về trang 1; số trên nút "Bộ lọc" không đếm kho.
- [ ] Laptop có sidebar (bộ lọc gom vào popover): popover "Bộ lọc" rộng ~20rem, mỗi ô có nhãn phía trên (Trạng thái, Ngày tạo, Người lập, Người xác nhận); Trạng thái là 3 nút bấm nhanh (bấm lại để bỏ chọn); mũi tên các ô là ⌄ cùng kiểu; "Xoá bộ lọc" ở chân popover.
- [ ] Có quyền `USER_READ`: thanh lọc có hai ô "Người lập" và "Người xác nhận". Không có quyền: cả hai ô biến mất, và `?requester=u-1&approver=u-2` trên URL không được gửi lên BE.
- [ ] Mở trang (chưa bấm ô nào) → Network không có request `GET /users` dạng danh sách; bấm mở một ô mới có request, gõ tên → `name=`, gõ toàn số → `phonenumber=`.
- [ ] Chọn người xong, nút ghi có tiền tố: "Người lập: Nguyễn Văn A (090…)" / "Người xác nhận: …" — chọn cùng một người cho cả hai vẫn phân biệt được ô nào. Danh sách xổ xuống vẫn chỉ ghi "Tên (SĐT)".
- [ ] Mỗi ô có nút ✕ riêng: bấm ✕ ô nào chỉ bỏ lọc ô đó, focus về nút của ô, URL mất đúng khoá tương ứng.
- [ ] Mobile (390px): chip chưa chọn ghi "Người lập" / "Người xác nhận"; đã chọn ghi "Người lập: <người>", không còn mũi tên, ✕ nằm cuối chip, bấm ✕ bỏ lọc. "Xoá bộ lọc" bỏ cả hai.
- [ ] Mở `?requester=<slug không tồn tại>` → nút ghi "Người lập: Người không xác định" kèm ✕ (không phải placeholder trơn); bấm ✕ thì bỏ lọc và URL sạch khoá `requester`.

- [ ] Tải lên file đuôi không cho phép (BE trả 101329) → lỗi gắn vào ô file đính kèm.

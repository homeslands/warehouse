# Đề xuất đặt hàng (warehouse-mobile) — thiết kế ngắn

Ngày: 2026-11-19 · Phạm vi: chỉ `app/warehouse-mobile`, không sửa backend/web.

## Mục đích và lý do

BRD (§2.7, §4.1): tồn ≤ Min → hành động "Đề xuất đặt hàng"; việc đặt hàng với NCC nằm **ngoài hệ thống**, phiếu nhập chỉ lập khi hàng đã về và đã kiểm. App hiện chỉ báo "dưới mức" mà không giúp bước tiếp theo. Tính năng này trả lời: **đặt gì, bao nhiêu, với ai**, và cho gửi danh sách cho NCC (Zalo/tin nhắn) ngay từ điện thoại.

- Mục tiêu: một màn liệt kê vật tư cần đặt của kho đang chọn, số gợi ý sửa được, gom theo bên bán, chia sẻ từng nhóm dạng chữ; đánh dấu "đã đặt" để khỏi đặt trùng.
- Không làm: tạo phiếu nhập / phiếu đặt hàng trên hệ thống; lưu "đã đặt" lên server (On-order — BRD §2.6.1, cần BE); push thông báo.
- Coi là hỏng nếu: danh sách gợi ý sai bên bán làm người dùng gửi nhầm NCC; hoặc dấu "đã đặt" che mất vật tư đã thực sự hết mà hàng không về.

## Cách làm đã chọn: màn riêng (A)

Đã cân nhắc: (A) màn riêng trong Stack tab Tồn kho — **chọn**, vì gom được theo bên bán và có chỗ cho số gợi ý mà không làm rối danh sách tồn; (B) bộ lọc "Cần đặt" + chọn nhiều ngay trên tab Tồn kho — dòng tồn không có chỗ cho số gợi ý/nhóm bên bán, và menu Lọc tab Tồn kho đang có lỗi đã biết; (C) sheet từ Tổng quan — không hợp danh sách dài có sửa số + chia sẻ.

## Thiết kế

**Lối vào**

- Tổng quan → "Việc cần làm" → hàng `stockLow` mở màn Đề xuất đặt hàng (thay cho tab Tồn kho lọc sẵn). _(quyết định của Claude — đúng "hành động" BRD gắn với cảnh báo này)_
- Tab Tồn kho: hàng "Đề xuất đặt hàng · n" ở đầu danh sách khi n > 0 (không thêm nút header — header đã có Quét, Lọc, kho). _(quyết định của Claude)_
- Quyền: như tab Tồn kho (đọc tồn). Bên bán chỉ hiện khi có quyền đọc vật tư khả dụng của phiếu nhập; không có → một nhóm chung "Vật tư cần đặt".

**Dữ liệu (API có sẵn)**

- `useInventory(kho)` (đủ mọi trang): `quantity`, `effectiveMinimumInventory`, `effectiveMaximumInventory`, `isBelowMinimum`, đơn vị gốc + `units`.
- `fetchAllAvailableMaterials(kho)`: `suppliers[]` của từng vật tư.
- Mức: **đỏ** = hết hàng (tồn ≤ 0, kể cả chưa đặt Min) hoặc tồn < Min (Min > 0) — ruling R5 khi chạy plan để khớp số "dưới mức" ở Tổng quan và chip "Thiếu" tab Tồn kho; **vàng** = Min ≤ tồn ≤ Min × 1,2. BRD §2.7.1 ghi đỏ là "≤ Min", nhưng backend (`isBelowMinimum`) và con số "dưới mức" ở Tổng quan dùng "< Min" → app theo backend để hai con số khớp; tồn đúng bằng Min hiện vàng. _(quyết định khi lập plan)_ Mặc định hiện cả đỏ và vàng, công tắc ẩn vàng. Vật tư Min ≤ 0 không vào danh sách.

**Số gợi ý**

- Max > 0: `Max − tồn` (theo đơn vị gốc), làm tròn lên số nguyên. Max ≤ 0: để trống "Nhập số".
- Chạm dòng → sheet sửa số + chọn đơn vị trong `units` (quy đổi theo `conversionRate`). Số đã sửa lưu trên máy theo người dùng + kho + vật tư, hết hạn cùng dấu "đã đặt" hoặc khi tồn vượt Min.

**Gom theo bên bán**

- BRD §2.1.3 có "Nhà cung cấp chính" nhưng backend không có trường này (chỉ có danh sách bên bán) → **người dùng chọn** (người dùng chốt 2026-11-19):
  - Vật tư có 1 bên bán → tự vào nhóm đó.
  - Nhiều bên bán và chưa chọn → nhóm "Cần chọn nơi đặt" (đầu danh sách); chạm "Chọn nơi đặt" trên dòng → sheet chọn trong danh sách bên bán của vật tư → dòng chuyển sang nhóm đó. Lựa chọn lưu trên máy theo người dùng + kho + vật tư, KHÔNG hết hạn (dùng lại lần sau); đổi được từ sheet sửa dòng. Bên bán đã chọn mà sau đó bị gỡ khỏi vật tư → coi như chưa chọn.
  - Không có bên bán → nhóm "Chưa có bên bán" (cuối).
  - Nhóm "Cần chọn nơi đặt" không có nút Chia sẻ.

**Màn hình — DÙNG LẠI mẫu tab Tồn kho** (người dùng chốt 2026-11-19: "lấy pattern UI các tab đã có cho đồng bộ"; mockup: https://claude.ai/artifact/SsGPNWrNYdiDY8kgjBY5BZ)

- Đầu danh sách: dòng chữ phụ 13 xám "Kho … · số gợi ý = tối đa − tồn" + hàng chip như `StockLevelChips`: [Tất cả n] [• Thiếu n (chấm `destructive`)] [• Sắp thiếu n (chấm `warning`)] — thay công tắc "ẩn mức vàng".
- Tiêu đề nhóm = `ListSectionTitle` (20 đậm + dòng phụ 13 "n vật tư · m đã đặt"), đệm 6 / 24 như tab Tồn kho.
- Dòng = `PlainListRow` + ô icon hộp (`Package`) + 3 `RowLine`: [tên 16 semibold | số đặt 16 medium + đơn vị 14 xám] / [mã · "tồn X đơn vị" 14 xám | `RowStatus` nghiêng: "Thiếu n" (`statusWarning`, như tab Tồn kho), "Sắp thiếu" (`warningText`), "Đã đặt dd/MM" (`statusSuccess`)] / ["Tối thiểu · Tối đa" 13 xám | "gợi ý" / "bạn đã sửa" / "không gửi lại"]. Dòng chưa chọn nơi đặt: chỗ số = chữ accent "Chọn nơi đặt"; chưa có số: "Nhập số". Dòng đã đặt: chữ xám, ô icon mờ.
- Hành động gửi = DÒNG CUỐI NHÓM (kiểu "+ Gắn vào kho" ở chi tiết vật tư): ô icon chia sẻ nền `accentSoft` + "Gửi cho <bên bán>" (nhóm `none`/`all`: "Chia sẻ danh sách"); khoá + câu "Nhập số cho vật tư để chia sẻ" khi `shareableRows` rỗng. Nhóm "Cần chọn nơi đặt" không có dòng này.
- Sheet dòng: khuôn `SheetScaffold` (✕ / tên vật tư / ✓); ô "Số lượng đặt" (`FormField`), dòng "Đơn vị" mở action sheet gốc như sheet dòng phiếu (`ComposeLineSheet`), chú thích gợi ý + tỉ lệ đơn vị; "Nơi đặt" = `ChoiceCard` như sheet chọn bên bán; nút "Bỏ dấu "Đã đặt dd/MM"".

Phác thảo cũ (bố cục; kiểu dáng theo các gạch đầu dòng trên):

```
Đề xuất đặt hàng
Kho Trung tâm · 7 vật tư      [Ẩn mức vàng]
CẦN CHỌN NƠI ĐẶT · 1
 ● Đường cát       tồn 1 / min 5       [Chọn nơi đặt]
CÔNG TY SỮA ABC · 3                    [Chia sẻ]
 ● Sữa tươi 1L     tồn 4 / min 10      đặt 26 chai
 ◐ Kem béo         tồn 6 / min 5       đặt 9 hộp
 ✓ Sữa đặc  (Đã đặt 19/11, mờ)         đặt 13 lon
CHƯA CÓ BÊN BÁN · 1                    [Chia sẻ]
 ● Ly giấy 12oz    tồn 0 / min 100     Nhập số
```

**Chia sẻ**

- Nút "Chia sẻ" mỗi nhóm → `Share.share` của React Native (không thêm thư viện) với đoạn chữ: tên kho, ngày, từng dòng "Tên (mã) — số đơn vị". Bỏ dòng đã đặt và dòng chưa có số.
- Chia sẻ xong (không bị huỷ) → hỏi "Đánh dấu n vật tư là đã đặt?" → đánh dấu.

**Dấu "đã đặt"** (lưu trên máy, `shared/storage/kv`, khoá theo người dùng + kho)

- Lưu: vật tư → ngày đặt. Hết dấu khi vật tư ra khỏi danh sách (tồn > Min × 1,2) hoặc sau 7 ngày. (Sửa khi chạy plan: "tồn > Min" làm mất dấu của vật tư vàng ngay lập tức.) Có thể bỏ dấu thủ công (vuốt/menu dòng).
- Dòng có dấu: mờ, nhãn "Đã đặt dd/MM", không vào lần chia sẻ sau. Không đồng bộ giữa máy/người — chấp nhận (mỗi kho thường một người đặt hàng).

**Chữ / quy ước**: i18n `vi` + `en`; số/ngày `Text numeric`; ghi chỉ trên máy nên không cần `confirmAction` trừ bước đánh dấu sau chia sẻ; Reduce Motion, vùng chạm ≥ 44pt như luật chung.

## Lưu ý về sau

- ERP/PO chưa kết nối ở giai đoạn này (BRD §1.2, §2.3.3, §3.4). Khi nối, đơn mua hàng có thể lập trên ERP; danh sách đề xuất này có thể thành đầu vào cho ERP — BRD chưa mô tả, chưa làm gì bây giờ.

## Để lại cho người làm

- Tên route/slice (gợi ý: `screens/reorder`, `features/reorder` cho logic thuần: tính mức, số gợi ý, gom nhóm, soạn chữ chia sẻ, dấu đã đặt).
- Test: logic thuần (mức đỏ/vàng, Max ≤ 0, nhiều/không bên bán, hết hạn dấu, soạn chữ), màn (hiện nhóm, sửa số, chia sẻ → đánh dấu), routing (lối vào từ Tổng quan và tab Tồn kho). Chạy jest `--maxWorkers=2`.
- Cập nhật `docs/agents/` (thêm mục cho màn này, sửa `overview-tab.md` về hàng `stockLow`).

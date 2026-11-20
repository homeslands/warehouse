# Đề xuất đặt hàng

Đọc khi: sửa màn Đề xuất đặt hàng (`/stock/reorder`), sheet sửa dòng `/reorder-line`, `features/reorder` (mức đỏ/vàng, số gợi ý, gom nhóm bên bán, chữ chia sẻ, dấu "đã đặt" lưu trên máy), hoặc các lối vào của nó (Tổng quan `stockLow`, hàng đầu danh sách tồn).

Spec: `docs/superpowers/specs/2026-11-19-reorder-suggestions-design.md` (local). Việc đặt hàng với bên bán nằm NGOÀI hệ thống: app chỉ gợi ý đặt gì / bao nhiêu / với ai và chia sẻ chữ; không tạo phiếu, không ghi lên server.

## Cấu trúc

- `src/features/reorder` (logic thuần + store; import qua `index.ts`): `reorderLevel`, `suggestedBaseQty`, `buildReorderGroups`, `reorderGroupKey`, `reorderShareText` / `shareableRows`, `useReorderStore`, `pruneLocal`, `reorderStorageKey`, `todayKey`, `MARK_TTL_DAYS`.
- `src/screens/reorder`: `ReorderScreen` (route `app/(tabs)/stock/reorder.tsx`, khai trong `TabStackLayout` cho tab `stock`, nằm trên `index` danh sách tồn) và `ReorderLineSheetScreen` (route sheet gốc `app/reorder-line/` → `/reorder-line?materialSlug=…`, hết cỡ, trong `SHEET_ROUTES`). Màn khác (vd `screens/stock`) chỉ import `@/features/reorder`, KHÔNG import `screens/reorder`.
- Dữ liệu: `useInventory(kho)` (tồn, min/max, đơn vị) + `fetchAllAvailableMaterials` (`suppliers[]` của vật tư).

## Luật

- **Mức** (ruling R5: số đỏ = "Thiếu" của chip tab Tồn kho = `stockLow` Tổng quan = hết hàng + dưới Min theo `stockLevel`): đỏ = `tồn <= 0 || (min > 0 && tồn < min)` — hết hàng LUÔN đỏ kể cả Min chưa đặt (0); vàng = `min > 0 && min <= tồn <= min × 1,2` (`YELLOW_FACTOR`, làm tròn 6 số lẻ để 3 × 1,2 không rớt khỏi vùng vàng). Còn hàng mà `min ≤ 0` → không vào danh sách. Hết hàng mà `max ≤ 0` → vẫn đỏ nhưng không có số gợi ý ("Nhập số"). `min`/`max` = `effectiveMinimumInventory` / `effectiveMaximumInventory`.
- **Số gợi ý** (đơn vị gốc) = `max > 0 ? ⌈max − tồn⌉ : null`; kết quả ≤ 0 → `null` ("Nhập số"). Số đã sửa lưu kèm đơn vị (`{ value, unitSlug }`, đơn vị trong `units` của vật tư); đơn vị đã bị gỡ khỏi vật tư (không còn trong `units`, không phải đơn vị gốc) → `toRow` bỏ số đã sửa, về số gợi ý theo đơn vị gốc.
- **Nhóm** (`buildReorderGroups`; khoá `reorderGroupKey` = `choose | none | all | supplier-<slug>`): 1 bên bán → nhóm bên bán đó; nhiều bên bán → nhóm bên bán đã chọn, chưa chọn / bên đã chọn không còn trong `suppliers` → `choose` ("Cần chọn nơi đặt", đầu danh sách, KHÔNG có nút gửi); không bên bán → `none` (cuối). Thiếu quyền `IMPORT_FORM_CREATE` (BE gác `available-materials` bằng quyền này) → KHÔNG gọi API đó, một nhóm `all` "Vật tư cần đặt"; `useAllAvailableMaterials` báo `truncated` (chạm trần 50 trang, danh sách bên bán thiếu) → cũng coi như không có dữ liệu bên bán (`materials = null`, nhóm `all`) ở cả màn lẫn sheet. Trong nhóm: đỏ trước vàng, rồi theo mã. Chip [Tất cả] [Thiếu] [Sắp thiếu] chọn có hiện vàng hay không; chip mức có số 0 thì ẩn (như `StockLevelChips`), chip đang chọn mà về 0 → quay về "Tất cả" (`effectiveReorderChip`); kho không có gì → câu rỗng, không chip.
- **Chia sẻ**: `Share.share` của react-native (không thêm thư viện); chữ gồm tên kho, ngày, từng dòng "n. Tên (mã) — số đơn vị". `shareableRows` bỏ dòng đã đặt và dòng chưa có số; nhóm `choose` không bao giờ vào chữ. Chỉ khi `Share.sharedAction` mới hỏi (`confirmAction`) "Bạn đã gửi cho <bên bán>? Đánh dấu n vật tư là đã đặt." (nhóm không có bên bán: "Bạn đã gửi danh sách này? …"; key `markMessage` / `markListMessage`, số nhiều `_one`/`_other`); huỷ (`dismissedAction`) hoặc lỗi → không hỏi, không đổi gì. Giới hạn Android: `Share.share` luôn trả `sharedAction` kể cả khi người dùng đóng bảng chọn mà không gửi → không phân biệt được, nên câu hỏi phải để người dùng tự xác nhận đã gửi (không tự đánh dấu).
- **Dấu "đã đặt" và số đã sửa** hết khi vật tư ra khỏi danh sách (`reorderLevel(item) === null`, tức tồn > Min × 1,2) HOẶC sau `MARK_TTL_DAYS` = 7 ngày (đúng 7 ngày vẫn giữ). Ruling R4: KHÔNG dùng "tồn > Min" vì vật tư vàng sẽ mất dấu ngay khi vừa đánh dấu. Nơi đặt đã chọn (`supplierSlug`) không hết hạn; vật tư không còn trong kho → bỏ cả mục.

## Store và khoá kv

`useReorderStore` (`reorder.store.ts`): `{ scope, local, loaded }`, `local` khoá theo `materialSlug` → `{ qty?, supplierSlug?, orderedAt? }`. Lưu AsyncStorage qua `shared/storage/kv` ở khoá `reorder.v1.<userSlug>.<warehouseSlug>` (`reorderStorageKey`); `scope = userSlug|warehouseSlug`. Mỗi người dùng + kho một bộ, không đồng bộ giữa máy (chấp nhận).

## Bẫy

- Khung hình đầu sau đổi kho / người: màn chỉ dùng `local` khi `ready` (`loaded && scope === userKey|kho`), nếu không dùng `{}`. Sheet cũng chờ `ready` (spinner, không ✓) và tự `load` khi store lệch khoá (mở thẳng bằng deep link); thân sheet chỉ dựng khi đã biết bên bán (`available` hết `isPending` hoặc không có quyền) để tick nơi đặt đã lưu hiện đúng.
- Sheet `/reorder-line` có sửa chưa ✓ (số / đơn vị / nơi đặt khác lúc mở) → `useDiscardGuard` hỏi "Bỏ thay đổi?" khi vuốt đóng / ✕ / back (xem `sheets.md`); ✓ ghi xong đóng không hỏi.

- Đổi `scope` → `local` về rỗng NGAY rồi mới đọc kv (không lộ dấu của kho/người cũ); kết quả đọc trễ bị bỏ nếu đã có lần nạp khác hoặc `getSessionEpoch()` đã đổi. Sheet ghim kho lúc mở, đổi kho thì đóng (như `StockThresholdSheetScreen`).
- Mọi lệnh ghi (`setQty`, `setSupplier`, `markOrdered`, `unmarkOrdered`…) bị BỎ QUA cho đến khi `loaded` — tránh ghi đè dữ liệu chưa đọc xong.
- Chỉ `pruneLocal` với tồn đã nạp xong (R3); chưa có `inventory.data` thì không dọn (nếu không sẽ xoá sạch dấu khi mạng lỗi). `pruneLocal` trả đúng object cũ khi không đổi gì → bỏ qua ghi.
- `available-materials` lỗi / đang tải trong khi tồn đã có → vẫn hiện danh sách (một nhóm chung tạm thời + câu lỗi có Thử lại), không chặn cả màn.
- Hạn dùng của dấu so theo ngày giờ máy (`todayKey()` = `yyyy-MM-dd`), chuỗi sai dạng coi là hết hạn.

## Quyền và guard

Như tab Tồn kho: `inTabs && canSeeStock` (`tabsFor(user)` có `stock`), cho cả `/stock/reorder` (qua tab Tồn kho) và `/reorder-line` (`SessionGate`). Thiếu quyền → về tab đầu. Bên bán chỉ hiện khi có `IMPORT_FORM_CREATE`.

## Lối vào

- Tổng quan → "Việc cần làm" → hàng `stockLow` → `{ pathname: '/stock/reorder', params: {} }` (không còn mở `/stock` lọc `low`; chip "Thiếu" và menu Lọc ở tab Tồn kho vẫn lọc `low`).
- Tab Tồn kho: hàng `stock-reorder-entry` "Đề xuất đặt hàng · n" dưới `StockLevelChips` khi n > 0; n = số vật tư có `reorderLevel(item) !== null` trên CẢ kho (không theo tìm kiếm / chip); bấm → `router.push('/stock/reorder')`.

## Test

- Logic: `features/reorder/model/*.test.ts` (mức, gợi ý, nhóm, chữ chia sẻ, store + prune).
- Màn / sheet: `screens/reorder/ReorderScreen.test.tsx`, `ReorderLineSheetScreen.test.tsx` (chia sẻ → đánh dấu, huỷ chia sẻ, đổi kho, lỗi / cắt `available-materials`, chip "Thiếu" khớp `stockOverview`, chip 0 ẩn, deep link, bỏ thay đổi).
- Lối vào: `screens/overview/model/todos.test.ts`, `screens/stock/StockListScreen.test.tsx`; điều hướng: `bootstrap/routing.test.tsx` (mở `/stock/reorder` với `index` nằm dưới, `/reorder-line` thiếu quyền tồn → về home, Tổng quan `stockLow` → `/stock/reorder`).

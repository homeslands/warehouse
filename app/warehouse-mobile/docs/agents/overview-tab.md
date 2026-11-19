# Tab Tổng quan

Đọc khi: sửa tab Tổng quan (trang Tóm tắt kiểu Apple Health + màn chi tiết), kỳ Ngày/Tuần/Tháng/Năm, số đếm "Việc cần làm", preset bộ lọc (`?preset=`) của các tab đích.

Tab đứng đầu thanh tab, là màn mở mặc định sau khi chọn kho (`hrefFor('tabs')` = `/${tabsFor(user)[0]}` = `/overview`). Màn: `src/screens/overview` (`OverviewScreen`, `ui/{AttentionCard,MoneySection,TodoCard,StockSummaryCard,ActivitySummaryCard,MiniBars}`, `model/{todos,donut}.ts`), chi tiết `src/screens/overview-detail`, kỳ + thẻ dùng chung `src/features/overview-period`; route `app/(tabs)/overview/{index,[metric]}.tsx`. Spec local: `docs/superpowers/specs/2026-11-12-overview-health-style-design.md`, kiểu card: `docs/superpowers/specs/2026-11-12-overview-card-style-design.md`.

## Khung card (`shared/ui/card`, import từ `@/shared/ui`; xem `ui-foundations.md`)

- `DashCard` (nền card, bo 24, đệm 20/18), `CardHeader` (vòng tròn `fill` 40pt + icon `foreground` + nhãn `mutedForeground`; biến thể cảnh báo `destructiveSoft`/`destructive` CHỈ cho Hạn dùng), `CardRow` (hàng chạm ≥ 44pt, phản hồi `rowPressed`, `haptics`), `CardFooter`, `PillButton` (nút viên accentText trên `fill`), `CardLink` ("… ›"), `CardChevron`. `Values.tsx` (cùng thư mục): `GroupTitle`, `BigValue`, `StateValue` (cỡ mặc định 32, co chữ). Màu chỉ từ token. `HealthCard` đã xoá.

## Bố cục Tóm tắt

Từ trên xuống: dòng ngày (chữ nhỏ, không phải tiêu đề) → `PeriodBar` (thanh đoạn Ngày/Tuần/Tháng/Năm `period-seg` + `‹ nhãn kỳ ›` `period-label`, nút 44x44, › mờ ở kỳ hiện tại) → **Cần chú ý** (`AttentionCard`) → **Tiền** (`MoneySection`) → **Việc cần làm** (`TodoCard`) → **Tồn kho** (`StockSummaryCard`) → **Hoạt động** (`ActivitySummaryCard`). Thẻ không có quyền thì ẩn và KHÔNG request.

- **Cần chú ý** (`attention-expiry`, `attention-lot-<slug>`, `attention-soon-error`, `attention-expired-error`): hiện khi quá hạn > 0, sắp hết hạn > 0 HOẶC một số đếm lỗi (lỗi quá hạn → số to "!"; quá hạn = 0 mà sắp hết hạn lỗi → "!"; nhãn a11y phân biệt đang tải / lỗi) (quá hạn = 0 → số to là số sắp hết hạn, màu cam). Card cảnh báo (đỏ): khối chính `attention-expiry-main` (tĩnh, mang nhãn a11y gộp), hàng `attention-expiry-expired` / `attention-expiry-soon` (ẩn khi 0, chạm → `onOpen(focus)` mở sheet `/expiry-batches` đúng nhóm, `expiryHref`, xem `sheets.md`), link `attention-expiry-all` "Xem tất cả ›" (chân card), 2 lô `attention-lot-*` dưới hàng (mỗi lô là một hàng chạm được, mở sheet nhóm theo trạng thái: quá hạn → `expired`, còn lại → `soon`). Cả card không chạm được; chỉ các hàng, hàng lô và "Xem tất cả ›" chạm được. Chỉ có sắp hết hạn: dòng chính "N lô sắp hết hạn", 1 hàng (cam); danh sách lô chỉ tải khi đã biết có lô (`useExpiringBatches(hasLots ? slug : undefined)`). Cần `MATERIAL_READ` + `WAREHOUSE_READ`.
- **Tiền**: `money-diff` (chênh lệch nhập − xuất + thanh so sánh), `money-import` / `money-export` (số to + cột mini `mini-bars-*` + dòng "▲ 12% so tháng 10"), `money-pending` "Hiện tại" (tổng phiếu nhập `DRAFT` + xuất `PENDING`, không theo kỳ, dùng `use*FormSum`). Hậu tố `-value` / `-error` / `-loading`. Chạm Nhập / Xuất → `/overview/import|export`.
- **Tồn kho**: card tĩnh `stock-card` (khối chính `stock-card-main` mang nhãn a11y), vòng `stock-donut` 64pt, chân card link `overview-stock` "Xem tồn kho ›" → `/stock` `preset=all`. 4 đoạn: hết → dưới mức → vượt mức → ổn định; giữa vòng `okPercent` = `Math.floor(ok*100/total)`, `null` khi `total = 0` (hiện "–"); đoạn nhỏ nhất ≥ 1 chấm (`minFraction`). Animation reanimated, `useReducedMotion()` → vẽ ngay.
- **Hoạt động**: card tĩnh `activity-summary` (khối chính `activity-main`, + `mini-bars-activity` cột đôi nhập `accent` / xuất `chart2`), tổng số phiếu, nút viên `activity-detail` → `/overview/activity`.
- Token: `chart2` (xuất, tím) và `chart3` (teal, nhóm Hoạt động; sáng `#0e7f93`, tối `#40c8e0`) trong `src/shared/theme/tokens.ts`, có đủ sáng + tối.

## Kỳ (`features/overview-period`)

- `Period = 'day' | 'week' | 'month' | 'year'`, mặc định `month`. `usePeriodStore` giữ `{ period, offset }` (offset 0 = kỳ hiện tại, ‹ lùi một kỳ); reset khi phiên kết thúc (`bootstrap/session-wiring.ts`).
- `periodRange(period, offset, now)` → `PeriodInfo` (`startDate`/`endDate` dạng `YYYY-MM-DD`, giờ máy). Kỳ hiện tại kết thúc ở HÔM NAY (không phải cuối kỳ); tuần bắt đầu thứ Hai. Kỳ đã qua = cả kỳ.
- `previousRange(info, now)`: kỳ so sánh cùng độ dài tới cùng điểm — Tháng 31/3 so tháng 2 (kẹp 28/29), Tuần ở thứ Tư so tuần trước tới thứ Tư, Năm tới 12/11 so năm trước tới 12/11, Ngày hôm nay tới giờ hiện tại so hôm qua tới cùng giờ. Có `cutoff` (giờ trong ngày; ngày bị kẹp → hết ngày) vì server chỉ lọc theo ngày, client cắt giờ. Kỳ đã qua: cả kỳ trước, không cutoff.
- Cột (bucket): Ngày 24 giờ, Tuần 7 ngày, Tháng 28–31 ngày, Năm 12 tháng. `bucketIndex(createdAt, info)` / `bucketize` gom theo ngày/giờ LOCAL của máy; ô chưa tới để trống, ô 0 = vạch `fill`. `highlight(info, values, now)` tính ô nổi bật và trung bình chỉ trên các ô đã qua. `periodLabel`, `compareDelta` ("▲ 12% so tháng 10", chỉ khi cả hai kỳ đủ số; kỳ trước 0 → "Tháng 10: 0 đ").

## Một nguồn dữ liệu

Tiền + cột + Hoạt động + màn chi tiết đều lấy từ `useImportConfirmedForms` / `useExportConfirmedForms` (entity `import-form` / `export-form`): tải HẾT phiếu `CONFIRMED` của kỳ (lọc `startDate`/`endDate` theo ngày lập, size 100, trần 50 trang) dưới dạng `SlimForm` (`shared/lib/slim-form.ts`: mã, slug, ngày lập, tiền, bên liên quan). Thay cho 14 request đếm theo ngày + `*FormSum`.

- Key `[...warehouse(slug), 'list', { ...range, period: true }]` — nằm dưới tiền tố `'list'` nên mọi invalidate phiếu (tạo / xác nhận / huỷ) làm mới luôn. Đừng đổi ra ngoài `'list'`.
- `placeholderData` giữ số kỳ cũ CHỈ khi cùng kho (`queryKey[1]` = slug hiện tại); đổi kho → đang tải, không bao giờ hiện số kho cũ. Đổi kỳ cùng kho: số + cột cũ mờ (opacity .45, `isPlaceholderData`) tới khi có số mới; dòng "so kỳ trước" ẩn trong lúc đó (không so số tạm với tên kỳ mới).
- `truncated` (chạm trần 50 trang) → "–" + chú thích "quá nhiều phiếu để tính", không vẽ cột nhóm đó, không bao giờ hiện tổng thiếu như đủ. Lỗi → "!" (lỗi khi làm mới giữ số đang có). Luật trạng thái ở `StateValue` (`shared/ui/card/Values.tsx`): lỗi > tải > vượt trần > số.
- `flowOf(query, info, now)` (`model/summary.ts`) gom `ok{amount,count,bars,stale,elapsed}`; số gom của kỳ cũ tra qua WeakMap theo tham chiếu data.
- Tiền rút gọn (`formatMoneyCompact`) CHỈ khi >= 1 triệu ("3,1 tr đ", "1,5 tỷ đ"; en không cách trước đơn vị); dưới 1 triệu dùng `formatMoney` đầy đủ. `splitAmount` tách số to và đơn vị nhỏ muted (Text lồng, cùng chân chữ). VoiceOver / TalkBack đọc số ĐẦY ĐỦ + %.

## Màn chi tiết `/overview/[metric]`

`OverviewDetailScreen` (route `app/(tabs)/overview/[metric].tsx`), `metric` = `import` | `export` | `activity`. Tiêu đề nhỏ giữa do màn khai (`options.title`).

- Kỳ RIÊNG: `useState` khởi từ `usePeriodStore.getState()` lúc mở rồi không đụng store (đổi kỳ ở chi tiết không ảnh hưởng Tóm tắt). Thẻ tổng `TỔNG` / `SỐ PHIẾU` số đầy đủ (`formatMoney`) + dòng phụ khoảng ngày · số phiếu · so kỳ trước (Hoạt động không có % so kỳ trước và không tải kỳ so sánh).
- Biểu đồ `BigBarChart`: cử chỉ react-native-gesture-handler API hook (không `Gesture.*`): `usePanGesture({ activeOffsetX: [-8, 8], failOffsetY: [-10, 10] })` + `useTapGesture({ maxDistance: 10 })` gộp bằng `useCompetingGestures`, `runOnJS`; testID `detail-pan` / `detail-tap`, cột `bar-<bucket>` (Hoạt động `bar-<b>-import|export`). Chạm / kéo chọn cột (rung `haptics.selection()` mỗi lần đổi ô), số to = giá trị cột; thả sau kéo hoặc chạm lại → về tổng; ô chưa tới kẹp về ô cuối đã qua; không chọn khi số tạm. Trục phải `niceMax`, nhãn thời gian thưa, đường TB đứt nét (chỉ Nhập / Xuất; trục tiền rút gọn "2 tr", "500 N" chỉ cho vạch trục). Cả biểu đồ là MỘT phần tử a11y `adjustable`.
- Nổi bật (`highlight`, theo kỳ đang hiển thị + `now`): ẩn khi không có phiếu hoặc đang số tạm.
- Danh sách phiếu (`PeriodForms`, trong card, số tiền thay ›; "Xem thêm (n)" là `PillButton` `detail-more`; thẻ biểu đồ `detail-summary` chỉ đổi bo 24/lề 20x18): Nhập / Xuất theo tiền giảm dần (bằng nhau → mới trước), Hoạt động gộp theo thời gian mới nhất kèm nhãn loại; 20 dòng + "Xem thêm (n)" (mỗi lần +20); chạm → `/import/[formSlug]` | `/export/[formSlug]` (nhảy sang tab đích). Khớp đúng tập phiếu của tổng (`bucketIndex`). Trống: "Không có phiếu nào trong kỳ này."
- Chuyển hướng: `metric` lạ hoặc thiếu quyền (Nhập `IMPORT_FORM_READ`, Xuất `EXPORT_FORM_READ`, Hoạt động một trong hai) → `router.navigate('/overview')` (= pop nhờ `navigateToIndexPops`), mọi query `enabled=false`. Layout đặt `unstable_settings = { anchor: 'index' }` để link sâu thẳng vào chi tiết vẫn có Tóm tắt làm đáy Stack.
- Lấy lại: kéo làm mới + focus / foreground (xem mục Làm mới). Chuyển hướng về Tóm tắt chỉ khi còn phiên (`user`) và màn đang focus (`useIsFocused`) — đăng xuất / tab ở nền không bị đẩy.

## Card Việc cần làm

`TodoCard` (testID `todo-card`): header "Việc cần làm" + tối đa 5 hàng `CardRow`, thứ tự `importDraft, exportPending, exportDraft, stockLow, stockHigh`; chỉ hiện hàng có quyền, không quyền nào → không có card. Mỗi hàng: icon lucide + nhãn `todoRow.<key>` + số (`Text numeric`); nhãn a11y dùng nhãn dài `todo.<key>` ("Phiếu xuất chờ duyệt, 2"). Dòng chính `todo-total`: "N việc đang chờ" (chỉ cộng mục có số); còn mục tải / lỗi → "–"; tổng 0 → "Không có việc tồn". Giữ testID hàng: `todo-<key>`, `todo-<key>-count`, `todo-<key>-error`.

Mọi số là CẢ KHO (không lọc người lập). Hàng bằng 0 vẫn hiện (`muted`), vẫn chạm được. Mỗi hàng có trạng thái riêng: tải "–", lỗi "!" (vẫn chạm được), có số. Lỗi khi làm mới không xoá số đang có.

| Hàng (`TodoKey`) | Đếm bằng                                    | Quyền                                                     | Chạm → `preset`     |
| ---------------- | ------------------------------------------- | --------------------------------------------------------- | ------------------- |
| `importDraft`    | `useImportFormCount(slug, 'DRAFT')`         | `IMPORT_FORM_READ`                                        | `/import` `DRAFT`   |
| `exportPending`  | `useExportFormCount(slug, 'PENDING')`       | `EXPORT_FORM_READ` (nổi bật nếu có `EXPORT_FORM_CONFIRM`) | `/export` `PENDING` |
| `exportDraft`    | `useExportFormCount(slug, 'DRAFT')`         | `EXPORT_FORM_READ`                                        | `/export` `DRAFT`   |
| `stockLow`       | `stockOverview(useInventory)` → `out + low` | `MATERIAL_READ` + `WAREHOUSE_READ`                        | `/stock` `low`      |
| `stockHigh`      | `stockOverview` → `high`                    | như trên                                                  | `/stock` `high`     |

## Hạn dùng

Đếm lô còn hàng bằng `material-batches` `status=1&expiryBefore=<ngày>` (`useBatchCount`, key `inventoryKeys.expiryCount`): quá hạn = count(hôm nay); sắp hết hạn = count(hôm nay + 61) − quá hạn, tức hạn trong `EXPIRY_SOON_DAYS` (60) ngày tới (`expiryCutoffs`). Thiếu quyền → không request, không thẻ / badge. Sheet `/expiry-batches`: tiêu đề nhóm kèm số lô từ cùng hai count (danh sách dùng khoá `expiring` riêng). **Badge** tab Tổng quan = số lô quá hạn (xem `header-tabs-navigation.md`).

## Làm mới

- Tóm tắt: kéo xuống làm mới (số đếm, 4 query kỳ, 2 đang chờ, tồn, 2 đếm lô, danh sách lô nếu đang hiện) + làm mới khi focus / app về foreground (`useRefetchStale`, chỉ query đã cũ; predicate: inventory `kind === 'list' || 'expiry'`; phiếu `extra.count || extra.sum || extra.period === true`; không có kho → không request). Mốc ngày (`today`) tính lại mỗi render / focus / foreground nên qua nửa đêm dòng ngày, kỳ và mốc hạn dùng tự sang ngày mới. Kỳ so sánh (kỳ đang chạy) cắt ở `comparisonNow` = min(giờ hiện tại, `dataUpdatedAt` của query kỳ này), nên kỳ trước và kỳ này luôn cắt cùng một lúc (không lệch khi app mở lâu mà chưa tải lại).
- Chi tiết: kéo xuống làm mới + làm mới khi focus / foreground (chỉ phiếu theo kỳ `extra.period === true` đã cũ, cùng `useRefetchStale` và cùng `comparisonNow`); xác nhận / huỷ phiếu đã làm mới tiền tố `'list'`.

## Thử trên máy thật (jest không phủ được)

Tóm tắt

- Sáng / tối: màu đầu thẻ, thanh so sánh nhập/xuất, cột mini, vòng tồn kho, hàng Việc cần làm 0 `muted`, `chart3`.
- Số to + đơn vị nhỏ cùng chân chữ; số tỷ / số âm co chữ vừa thẻ; hai thẻ Nhập/Xuất cạnh nhau trên máy hẹp (iPhone SE) + cỡ chữ lớn; "▲ 12% so tháng 10" xuống 2 dòng không vỡ.
- Thanh đoạn đổi kỳ trượt mượt (cao 34pt < 44pt, SegmentedControl dùng chung); Reduce Motion → đổi ngay; ‹ › chạm 44pt.
- Đổi kỳ: số cũ mờ rồi thay, không nhảy layout; đổi kho khi đang lùi kỳ → khung xám, không lóe số kho cũ.
- Cột mini: Tháng 30–31 cột, Ngày 24 cột, Năm 12 cột — sắc nét, không tràn thẻ. Năm với kho nhiều phiếu: thời gian tải (tới 50 trang x 4 nhóm), Việc cần làm / Tồn kho không chờ.
- VoiceOver / TalkBack: dòng ngày, nhãn kỳ đọc lại khi đổi, thẻ Nhập/Xuất đọc số đầy đủ + %, cột mini bị bỏ qua.
- Chạm hàng / hàng lô / "Xem tất cả ›" của thẻ Hạn dùng (cả card không chạm được) → sheet đúng nhóm; Tồn kho → tab Tồn kho `all`; hàng Việc cần làm → preset; app qua nửa đêm rồi mở lại → dòng ngày + kỳ sang ngày mới; badge tab (iOS 26/27, Android) đúng số, mất khi 0, đổi kho cập nhật.

Card (kiểu mới)

- Sáng / tối: vòng icon `fill`, card Hạn dùng đỏ (`destructiveSoft`), chấm đỏ / cam ở hàng, nút viên accentText trên `fill`.
- Cỡ chữ lớn + iPhone SE: dòng chính 32 co chữ, 2 card Nhập/Xuất cạnh nhau, hàng Việc cần làm xuống 2 dòng.
- VoiceOver: hàng Việc cần làm đọc "Phiếu xuất chờ duyệt, 2"; khối chính Hạn dùng / Tồn kho / Hoạt động đọc nhãn gộp, hàng / nút / link vẫn tới được riêng.
- Vùng chạm ≥ 44, phản hồi `rowPressed`; chạm đúng đích (sheet focus expired/soon, `/stock` all, `/overview/activity`, preset hàng).
- Chi tiết: danh sách phiếu trong card (số tiền dài không tràn), "Xem thêm (n)" mở +20 dòng, Reduce Motion.

Chi tiết

- Push mượt, tiêu đề nhỏ giữa, back chỉ icon, vuốt mép trái để back; back về Tóm tắt giữ kỳ của Tóm tắt.
- Biểu đồ: chạm chọn cột, kéo ngang chọn liên tục có rung, thả về tổng; kéo dọc vẫn cuộn trang và kéo-để-làm-mới vẫn chạy; chạm ô tương lai kẹp về hôm nay. Tháng 31 cột / Ngày 24 cột trên máy hẹp không chồng nhau; nhãn trục thời gian / trục phải ("2 tr", "500 N") không bị cắt; đường TB đứt nét + nhãn đúng màu sáng / tối, nhãn TB có thể đè cột cao khi TB gần đỉnh.
- Reduce Motion: cột hiện ngay. VoiceOver / TalkBack: biểu đồ adjustable (vuốt lên/xuống đổi ô), tổng đọc lại khi đổi, dòng phiếu "Mã, ngày · bên, tiền".
- Chạm dòng phiếu → tab Nhập/Xuất mở màn xem phiếu, back về danh sách tab đó; quay lại tab Tổng quan vẫn ở chi tiết.
- Link sâu `/overview/foo`, `/overview/export` (không quyền xuất) → về Tóm tắt, không chớp màn lỗi. Đổi kho khi đang ở chi tiết → khung tải. Năm vượt trần hiện "–".

## Số đếm (entity)

`fetchImportFormCount` / `fetchExportFormCount`: `page=1, size=1, status`, lấy `total`. Hook `useImportFormCount` / `useExportFormCount`: `enabled && !!slug`, `staleTime` 30s, KHÔNG `keepPreviousData` (đổi kho không hiện số kho cũ). Key `…count(slug, status)` = `[...warehouse(slug), 'list', { status, count: true }]` — NẰM DƯỚI tiền tố `'list'` của danh sách phiếu nên mọi invalidate `'list'` hiện có (tạo / xác nhận / huỷ phiếu) làm mới luôn số đếm. Đừng đổi key ra ngoài `'list'`.

## Quy ước `preset`

- Chạm dòng: `router.navigate({ pathname, params: { preset } })`. Tab đích tự áp bộ lọc bằng `useRoutePreset` (`src/shared/lib/useRoutePreset.ts`): `useRoutePreset(allowed, apply)`.
- Preset thuộc `allowed` → `apply(preset)` đúng MỘT lần rồi xoá param (ref `handled` chặn áp lại khi param chưa kịp xoá; param về `undefined` thì reset để chạm lại cùng số áp lại được). Giá trị lạ / mảng → bỏ qua, chỉ xoá param, không đổi store. Chạy ở `useLayoutEffect` (không vẽ khung hình với bộ lọc cũ).
- Xoá param bằng `useNavigation().setParams({ preset: undefined })` (navigation của chính màn danh sách), KHÔNG dùng `router.setParams` (nó gán lên route `(tabs)` của Stack gốc, route danh sách vẫn giữ `preset` → chạm lại cùng số không áp lại).
- `apply` luôn xoá sạch tìm kiếm + chip trước khi đặt trạng thái / mức, để danh sách khớp đúng con số: Nhập `PRESETS=['DRAFT']` (`clearSearch; clearChips; setStatus`); Xuất `['DRAFT','PENDING']` (thêm `setType(null)`); Tồn kho `['low','high','all']` (`reset()`, rồi `setLevel` nếu không phải `all`). `PRESETS` và `apply` khai ở cấp module (tham chiếu ổn định cho deps của effect).
- Tab đích đang ở màn con (vd. xem phiếu xuất): `TabStackLayout` gắn `UNSTABLE_router={navigateToIndexPops}` — xem `header-tabs-navigation.md`.

## Tab và quyền

`overview` hiện khi có ít nhất một tab nghiệp vụ (import || export || stock). `hasBusinessTab` LOẠI `overview` và `account` (`NON_BUSINESS` trong `bootstrap/tabs.ts`) — người chỉ có Tài khoản vẫn về `/no-access`. Thứ tự `overview, import, export, stock, account`. Icon: SF `square.grid.2x2(.fill)`, Material `dashboard`.

## Test

`OverviewScreen.test.tsx`, `OverviewDetailScreen.test.tsx`, `features/overview-period` (`model/{period,period-store,summary}.test.ts`), `model/todos.test.ts`, `useRoutePreset.test.tsx`, test preset ở 3 màn danh sách, `tabs.test.ts`, `routing.test.tsx` (describe "tab Tổng quan", gồm "màn chi tiết"). Nhiều ca routing cũ ngầm dựa vào "tab đầu = Nhập" nay phải `go('/import')` sau `boot()`.

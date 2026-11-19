# Danh mục (Đơn vị, Loại vật tư, Vật tư + quy đổi)

Đọc khi: danh mục đơn vị / loại vật tư / vật tư + đơn vị quy đổi, `entities/unit`, `entities/material-type`, `entities/material`, `features/catalog-form`, `features/material-form`, `screens/catalog-*`, `screens/material-*`, `screens/conversion-unit-form`, gắn / gỡ vật tư vào kho (`features/warehouse-assign`, `screens/warehouse-assign`).

Đợt 1 xong: Đơn vị + Loại vật tư. Đợt 2 xong: Vật tư + Đơn vị quy đổi (mục "Vật tư và quy đổi" cuối file). Đợt 3a xong: gắn / gỡ vật tư vào kho (mục "Gắn / gỡ kho" cuối file). Còn lại: NCC, tạo vật tư + gắn một lần (POST), quét không ra → tạo.

## Lối vào và route

- Tài khoản → khối "Danh mục" (giữa "Làm việc" và "Cài đặt"): dòng "Vật tư" (đầu nhóm) khi `materialAbilities.read`, "Đơn vị" khi có `UNIT_READ`, "Loại vật tư" khi có `MATERIAL_READ`; không còn dòng nào thì ẩn cả khối.
- Màn danh sách: `app/(tabs)/account/units/index.tsx`, `material-types/index.tsx` (chỉ render `CatalogListScreen` với `kind`). Màn chi tiết: `units/[slug].tsx`, `material-types/[slug].tsx` (render `CatalogDetailScreen`). `TabStackLayout` khai cả bốn route (`title: ''`, màn tự khai tiêu đề); layout tab account có `anchor: 'index'` để link sâu vẫn có màn Tài khoản bên dưới. Mở thẳng không có quyền xem → EmptyState "không có quyền", không gọi API.
- Sheet: `/unit-form`, `/material-type-form` (`?slug=`; không slug = tạo). Hết cỡ `[1]`, có trong `SHEET_ROUTES`, guard `inTabs && READ`. Chi tiết sheet chung: `sheets.md`.

## Quyền

- Đơn vị = `UNIT_READ/CREATE/UPDATE/DELETE`; Loại vật tư = `MATERIAL_*` (không có quyền riêng). Hàm `unitAbilities` / `materialTypeAbilities` ở `entities/*/model/abilities.ts`.
- Nút + header chỉ khi CREATE. Mặc định chỉ ADMIN ghi, vai trò khác chỉ xem.

## Danh sách

- Tải hết (trang 100, tối đa 50 trang — `shared/api/fetch-all-pages.ts`) rồi lọc trên máy theo mã HOẶC tên, không phân biệt hoa thường và dấu (`shared/lib/catalog.ts`); sắp mã A→Z. Lý do: API chỉ tìm mã khớp đúng, lọc máy cho kết quả tức thì.
- **Chi tiết vật tư đồng bộ (2026-11-19)**: đầu trang (`material-detail-hero`) cùng dáng dòng danh sách — ô icon 44 trung tính `Package` (`material-detail-tile`) + tên 22 đậm + "mã · loại" font hệ thống (`material-detail-code`); mã kho / mã NCC ở dòng phụ font hệ thống (không `code`); dòng "+ Thêm đơn vị quy đổi" / "+ Gắn vào kho" là `ListRow action` (chữ + icon trơn màu `accent`, KHÔNG vòng 40 — vòng 40 trong thẻ chữ bị lệch như màn Tài khoản).
- Giao diện CÙNG KHUÔN danh sách Nhập / Xuất / Tồn kho (đồng bộ 2026-11-19): màn `Screen tone="plain"`, dòng phẳng `PlainListRow` (truyền `first`, KHÔNG `ItemSeparatorComponent`), tiêu đề nhóm đơn vị "Đang dùng" / "Chưa dùng" là `ListSectionTitle` (đệm 6 / 24). Dòng (`CatalogRow`, ở `shared/ui/catalog`, import qua `@/shared/ui/catalog`): ô icon 44 TRUNG TÍNH theo loại danh mục (Đơn vị `Ruler`, Loại vật tư `Tag`, Vật tư `Package`; testID `catalog-tile` — không còn tô xanh "đang dùng"); [tên 16 semibold | cột phải] / [mã · mô tả 14 xám, font hệ thống]; cột phải (testID `catalog-row-end`): đơn vị đang dùng = số `materialCount.total` 16 medium + " vật tư" 14 xám (backend đếm riêng, không cộng hai vai); vật tư = mã đơn vị gốc 14 xám. Không chevron. `ListItemCard` đã xoá.
- Đơn vị chia hai nhóm có tiêu đề "Đang dùng" (`total > 0`) / "Chưa dùng"; nhóm rỗng ẩn. Loại vật tư một khối không tiêu đề (backend không trả số đang dùng cho loại).
- Chạm dòng → push màn chi tiết `/account/units/<slug>` / `/account/material-types/<slug>` (không mở sheet).
- Danh mục dùng chung mọi kho: header KHÔNG có nút kho, chỉ nút +.

## Màn chi tiết (`CatalogDetailScreen`)

- Header nhỏ: tiêu đề = mã; nút chữ "Sửa" (chỉ khi `UPDATE`; iOS `unstable_headerRightItems` `type: 'button'`, Android `headerRight` ≥ 44pt) → push sheet `?slug=`. Dữ liệu từ `CATALOG_CONFIG[kind].useItem(slug)` (`useUnit` mượn `materialCount` từ cache list). Tải lỗi → `FirstLoadState` (Thử lại); tải 404 → EmptyState "không còn nữa" + invalidate list.
- Nội dung: nhóm thông tin (Mã, Tên, Mô tả — trống hiện "—"); đơn vị khi biết `materialCount` có khối "Đang dùng" (`testID="unit-usage"`: Đơn vị gốc / Đơn vị quy đổi kèm giải thích; quy đổi = `max(0, asConversionUnit − asBaseUnit)` vì `asConversionUnit` gồm cả dòng gốc); chân mờ "Tạo … · Cập nhật …"; nút Xoá đỏ (cần `DELETE`).
- Xoá: `confirmAction` destructive (ref chặn mở hộp lần hai) + `useGuardedAction` có `onError`; so `getSessionEpoch()` trước / sau (đổi phiên → bỏ kết quả, không invalidate, không back). Đơn vị `usageCount > 0` → nút mờ + `inUseHint`, không gọi API. Xong: `removeQueries(detail)`, invalidate list + `['inventory']`, `router.back()` đúng 1 lần. Không có discard guard nên không cần `releaseLeaveGuards()`.

## Sheet tạo / sửa (không còn xem, không còn xoá)

- Hai chế độ: tạo (cần CREATE) và sửa (cần UPDATE; lấy từ cache danh sách, không có thì `GET /:slug`). Thiếu quyền tương ứng (mở tạo thiếu CREATE, hoặc có `slug` thiếu UPDATE) → sheet tự đóng, không request. Xem và xoá nằm ở màn chi tiết.
- ✓ khoá khi chưa hợp lệ hoặc chưa đổi; bấm → `confirmAction` + `useSheetSubmit`. Sửa chỉ gửi trường đổi, mô tả xoá trống gửi `''`. Có `useDiscardGuard` ("Bỏ thay đổi?"). Lưu xong invalidate list + detail + `['inventory']` (màn chi tiết đang mở bên dưới tự cập nhật).
- Mã: tự viết hoa khi gõ; regex chép từ backend (đơn vị 1–32, loại 2–32). Tên, mô tả ≤ 255.

## Ánh xạ lỗi (`classifyCatalogError`)

- Lỗi thuộc trường (mã, tên) → dưới đúng ô, sheet mở.
- `notFound` (100901 / 100601): sheet (khi lưu) báo "đã bị xoá ở nơi khác" đầu sheet, làm mới danh sách, ẩn ✓, KHÔNG tự đóng; màn chi tiết (khi xoá) báo câu "không còn nữa", ẩn Xoá và Sửa.
- `inUse` (100909 / 100609) → chỉ ở màn chi tiết, câu dưới nút Xoá (loại vật tư chỉ biết qua lỗi này).
- `general` (mạng, 403, 5xx) → hộp lỗi đầu sheet (giữ dữ liệu đã gõ) / đầu màn chi tiết.

## Cache

- Sau ghi invalidate danh sách + chi tiết của danh mục đó và `['inventory']` (item tồn kho nhúng tên loại / đơn vị). Phiên đổi giữa chừng (`getSessionEpoch()`) thì bỏ kết quả.

## Mở rộng cho đợt sau

- Thêm danh mục mới: entity riêng (api, query keys, abilities), một mục trong `CATALOG_CONFIG`, route danh sách + chi tiết + sheet, i18n `catalog.json` (vi + en cùng key), thêm vào `SHEET_ROUTES`.

## Vật tư và quy đổi (đợt 2)

Code: `entities/material` (api, hooks, `materialAbilities`, `search.ts`, `base-unit-lock.ts`), `features/material-form` (validate, diff, `classifyMaterialError`, `useMaterialDraft`, `invalidateAfterMaterialWrite`), `screens/material-list` / `material-detail` / `material-form` / `conversion-unit-form`.

- Route: `app/(tabs)/account/materials/{index,[slug]}.tsx`; sheet `/material-form` (`?slug=`) và `/conversion-unit-form` (`?material=&unit=`) đều fullSheet; `/material-filter` nửa màn. Cả ba trong `SHEET_ROUTES`. `/material-form` và `/conversion-unit-form` có màn con `pick` (chọn Loại / Đơn vị gốc / Đơn vị quy đổi, ô tìm lọc máy, chạm là ghi `useMaterialDraft` rồi back); `SHEET_ROUTES` so khớp tiền tố nên `<sheet>/pick` cũng tính là đang ở sheet.
- Quyền (AND như web, `materialAbilities`): read = `MATERIAL_READ`; create / update = `MATERIAL_CREATE|UPDATE` + `UNIT_READ`; delete = `MATERIAL_DELETE`; `manageConversions` = `MATERIAL_UPDATE` + `UNIT_UPDATE` + `UNIT_READ`. Khối quy đổi / kho / NCC chỉ-xem chỉ cần READ (lấy từ DTO). Guard `Stack.Protected`: `/material-form`, `/material-filter` = `inTabs && read` (mở thiếu create/update thì sheet tự đóng); `/conversion-unit-form` = `inTabs && manageConversions`.
- Danh sách: phân trang server (30/trang, mã A→Z). Tìm qua API, KHÔNG lọc máy: gửi `name`, và nếu giống mã thì gửi thêm `code` (viết hoa), gộp theo `slug` khử trùng qua mọi trang. Ký tự lạ bị cắt khỏi từ khoá trước khi gửi (không để lộ lỗi 1007xx); chỉ còn ký tự đặc biệt → không gọi API, hiện "Chỉ tìm được theo chữ và số". Lọc theo loại: sheet `/material-filter` (store `useMaterialFilter` ở `screens/material-list`, reset khi đổi phiên); đang tải loại → vòng quay, lỗi → câu lỗi + Thử lại.
- Chi tiết: Thông tin, Đơn vị quy đổi (dòng gốc "Gốc" không bấm được; có `manageConversions` thì chạm dòng sửa + dòng "+ Thêm"), Kho (gắn / gỡ — xem mục "Gắn / gỡ kho"), NCC (chỉ xem). Xoá: nút mờ + câu hướng dẫn khi `warehouses.length > 0` (không gọi API); lỗi 100712 xử lý như `inUse`.
- Sheet vật tư: Loại và Đơn vị gốc chọn qua màn `pick`; tối thiểu > 0 mà tối đa trống / 0 → báo dưới ô Tối đa (backend coi 0 là max thật). Khoá đơn vị gốc (`base-unit-lock.ts`): khi sửa mà vật tư ĐÃ có đơn vị gốc và (có tồn > 0 ở kho nào hoặc `units.length > 1`) thì ô Đơn vị gốc chỉ đọc (gốc đang null thì luôn cho chọn) + câu giải thích (vẫn ánh xạ 100723 về ô này).
- Sheet quy đổi: Thêm = chọn Đơn vị (từ `conversion-units/available`) + Tỉ lệ; Sửa = đơn vị chỉ đọc + Tỉ lệ + nút "Gỡ đơn vị này". Gỡ có cảnh báo rõ (phiếu và tồn kho ghi theo đơn vị này có thể hiển thị sai) vì backend không chặn; confirm destructive + epoch.
- Cache: mọi lệnh ghi vật tư / quy đổi gọi `invalidateAfterMaterialWrite` (danh sách vật tư mọi lọc, chi tiết, `unitKeys.list()`, `['inventory']`, key "vật tư khả dụng" của phiếu nhập / xuất). Đổi phiên giữa chừng thì bỏ kết quả.
- Chưa làm: liên kết chéo tồn kho ↔ chi tiết danh mục.

## Gắn / gỡ kho (đợt 3a)

Code: `entities/inventory` (`assignMaterialToWarehouse` PUT, `removeMaterialFromWarehouse` DELETE `/warehouses/:w/materials`), `features/warehouse-assign` (luật thuần), `screens/warehouse-assign` (sheet), `screens/material-detail/MaterialWarehousesSection.tsx` (khối Kho).

- Quyền: `canAssignWarehouse` = `MATERIAL_UPDATE` VÀ `WAREHOUSE_UPDATE` (chung với sửa ngưỡng; mặc định chỉ ADMIN). Thiếu quyền → khối Kho chỉ xem như cũ. Route BE không có `@WarehouseScope`.
- Lối vào duy nhất: khối Kho ở chi tiết vật tư (không ở tab Tồn kho). Dòng "+ Gắn vào kho" → sheet `/warehouse-assign?material=` (fullSheet, MỘT màn — danh sách kho nằm trong sheet, không có `pick`; trong `SHEET_ROUTES`; guard `inTabs && materialAbilities.read && canAssignWarehouse`). Vật tư chưa có đơn vị gốc → dòng không bấm được + câu "Cần đặt đơn vị gốc…" (giống web).
- Sheet (đổi 2026-11-10 theo yêu cầu người dùng): giao diện như sheet chọn vật tư của phiếu (`/import-pick`): ô tìm viên, `MaterialPickList` (thẻ + ô tick tròn, "Chọn tất cả"), nút đáy "Gắn vào n kho", nút trái "Đóng"; ô tìm (`SearchField raised` — nền thẻ + viền mảnh để tách khỏi nền sheet) và hàng "Đã chọn · Chọn tất cả" (`PickSelectAllBar`) GHIM trên vùng cuộn qua `SheetScaffold top`, không ✓ header. CHỌN NHIỀU kho, KHÔNG có ô ngưỡng (kho mới theo mặc định vật tư; ngưỡng riêng sửa sau ở sheet ngưỡng tab Tồn kho). Kho lấy cùng nguồn bộ chọn kho (`useWarehouseStore.warehouses ?? user.warehouses`) qua `warehousePickStates`: BỎ kho đã gắn khỏi danh sách, kho tắt → "Đã tắt" chữ đỏ (`lockedTone: 'destructive'` của `MaterialPickList`), không tick được; hết kho → "Vật tư đã ở mọi kho…", chỉ còn kho tắt → "Các kho còn lại đều đã tắt.". Gửi = `assignToWarehouses`: PUT `{ materialSlug }` TUẦN TỰ từng kho, lỗi một kho không dừng kho sau, đổi phiên thì dừng và bỏ kết quả. Hết lỗi → đóng; có kho lỗi → giữ sheet, bỏ tick kho đã gắn được, hộp lỗi liệt kê từng kho + lý do (100802 → câu riêng + gợi ý liên hệ quản trị). KHÔNG gửi `quantity` (tồn ban đầu 0, hàng vào qua phiếu nhập).
- Gỡ: chạm dòng kho. Còn tồn / còn giữ chỗ (`quantity − availableQuantity > 0`) → `Alert` lý do, không gọi API. Được gỡ → `confirmAction` destructive kèm câu "Sau khi gỡ, hiện chưa gắn lại được vật tư này vào kho này." → DELETE (ref chặn hộp đôi, epoch). Lỗi 100801/404 = đã gỡ ở nơi khác (làm mới im lặng); 100807/100813 → Alert + làm mới.
- **Quirk BE (cần báo BE):** gỡ là xoá mềm, nhưng gắn kiểm cả dòng đã xoá mềm → gắn lại cùng kho trả 100802. App báo câu riêng (`warehouseAssign.reassignError`) thay vì "đã có ở kho này".
- Cache: mọi lệnh ghi gọi `invalidateAfterMaterialWrite(qc, slug)`; đổi phiên giữa chừng thì bỏ kết quả.

## Quét mã (2026-11-10)

- Ô Mã ở sheet vật tư có nút quét (khi sửa được) → màn con `/material-form/scan` (`ScanCodeSheetScreen`, màn quét toàn màn `ScanScreen` của `features/scan-material` — xem `stock-tab.md`) → ghi `useMaterialDraft.scannedCode` → form điền Mã (viết hoa) + hiện lỗi ngay; mã không hợp lệ làm Mã (QR URL, > 32 ký tự, ký tự lạ) → `material.field.scannedCodeInvalid`. Backend CHƯA có barcode: Mã quét được dùng thẳng làm `code` (yêu cầu BE: `docs/superpowers/specs/2026-11-10-be-request-material-barcodes.md`, local).
- Chế độ "tạo cho phiếu nhập": `/material-form?code=<mã>&importForm=<formSlug>` (mở từ thông báo quét không ra ở bước 2 soạn phiếu nhập) → chỉ tạo mới; cần `canCreateInWarehouse` (`MATERIAL_CREATE` + `MATERIAL_UPDATE` + `WAREHOUSE_UPDATE` + `UNIT_READ`, `features/warehouse-assign`) + bản nháp phiếu khớp + kho đang chọn, thiếu → tự đóng, không request. Lưu = `POST /warehouses/:w/materials` (`createMaterialInWarehouse`, entities/inventory) `{ material, supplierSlug? = formSupplierSlug }` — tạo + gắn kho + gắn bên bán một transaction → `addImportLines([toAvailableMaterial(item)])` + `useLineFocus` mở sheet dòng; không thêm được dòng → thông báo quét `full` / `noUnit`.
- **Chọn kho khi tạo vật tư (2026-11-10)**: form TẠO thường (không `slug`, không `importForm`) + `canAssignWarehouse` → dòng "Kho" (màn con `/material-form/warehouses`, `WarehousesPickSheetScreen`, chọn nhiều, kho tắt khoá) — mặc định tick kho đang chọn nếu đang hoạt động; lưu trong `useMaterialDraft.warehouses` (null = chưa khởi tạo). Lưu: có kho → `createMaterialInWarehouse(kho1)` rồi `assignToWarehouses(còn lại)`; kho phụ lỗi → vẫn đóng (vật tư đã tạo, không cho lưu lại) + `Alert` liệt kê kho lỗi; 0 kho → `POST /materials` như cũ. Lý do: `available-materials` của phiếu nhập chỉ thấy vật tư ĐÃ gắn vào kho.
- **Chọn Bên bán khi tạo vật tư (2026-11-10)**: form TẠO thường + `canAttachSupplier` (`SUPPLIER_READ` + `SUPPLIER_UPDATE` + `MATERIAL_UPDATE`, `features/warehouse-assign`) → dòng "Bên bán" sau dòng "Kho" (màn con `/material-form/suppliers`, `SuppliersPickSheetScreen`, chọn nhiều; `useMaterialDraft.suppliers`, null = chưa khởi tạo). Lưu: tạo (+ kho) → `attachToSuppliers` (`features/material-form`, tuần tự `PUT /suppliers/:slug/materials` `{ materialSlugs: [slug] }` qua `attachMaterialToSupplier` ở `entities/import-form`, epoch mỗi lần) → lỗi kho phụ / bên bán gộp MỘT `Alert` "Đã tạo vật tư", sheet vẫn đóng (không tạo lại). Form nhận thêm param `name` (điền sẵn Tên khi tạo).
- **Quét mã tìm vật tư (2026-11-18)**: header danh sách Vật tư có nút "Quét mã" (`catalog:material.scanSearch`; iOS SF `barcode.viewfinder`, Android `AndroidScanButton` của `shared/ui`) đứng trước nút Lọc → `/scan-catalog-material` (`MaterialScanScreen`, `ScanScreen` toàn màn đọc MỘT lần; `SessionGate` gác `inTabs && materialAbilities(user).read`, `scanModal`; có trong `SHEET_ROUTES`). Tra `fetchMaterialByCode` (nguyên chuỗi, rồi phần Mã của nhãn `<MÃ>*<SERIAL>`; khớp CHÍNH XÁC trên máy): thấy → đóng + push `/account/materials/<slug>`; không thấy / lỗi mạng → `useMaterialFilter.scannedQuery` = phần Mã rồi đóng; `MaterialListScreen` nghe store (`subscribe`), điền ô tìm một lần rồi xoá. ✕ lúc đang tra → kết quả bị bỏ.

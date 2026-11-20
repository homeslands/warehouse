# Tab Tổng quan (warehouse-mobile) — thiết kế

Ngày: 2026-11-11 · Trạng thái: chờ duyệt · Tài liệu local, không commit.

## Mục đích

Thủ kho mở app đầu ca cần biết ngay **việc gì đang chờ mình** ở kho đang chọn, và chạm một lần là tới đúng danh sách đã lọc sẵn. Tab Tổng quan là "hộp việc", không phải màn báo cáo.

## Mục tiêu

- Tab mới `overview` (nhãn "Tổng quan"), **đứng đầu** thanh tab và là **màn mở mặc định** sau khi chọn kho.
- Khối **"Việc cần làm"**: mỗi dòng = con số + nhãn + chevron; chạm → đặt bộ lọc của tab đích rồi chuyển sang tab đó.
- Dưới khối: tái dùng thanh tồn kho `StockOverview` (hết / dưới / vượt / bình thường) của tab Tồn kho.
- Kéo xuống để làm mới tất cả số liệu.

## Không làm

- Không sửa `warehouse-api`, không thêm endpoint thống kê.
- Không có biểu đồ theo thời gian, số "hôm nay/tuần", lối tắt tạo phiếu / quét mã.
- Không đếm "phiếu của tôi" — mọi số đều **cả kho** (người dùng chọn; cùng kho thấy phiếu của nhau là đúng).

## Anti-goal

- Số trên Tổng quan lệch với danh sách khi chạm vào (ví dụ thấy "3" mà mở ra 5) — phải dùng đúng cùng tiêu chí lọc.
- Tổng quan làm app chậm khởi động hoặc spam API (nhiều request mỗi lần vào tab).

## Các dòng "Việc cần làm"

| Dòng                     | Đếm bằng                                           | Quyền hiện dòng                                      | Chạm vào                                                                             |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Phiếu nhập chờ kiểm hàng | `GET import-forms?status=DRAFT&size=1` → `total`   | `IMPORT_FORM_READ`                                   | tab Nhập, `useImportListFilter.setStatus('DRAFT')`                                   |
| Phiếu xuất nháp          | `GET export-forms?status=DRAFT&size=1` → `total`   | `EXPORT_FORM_READ`                                   | tab Xuất, `useExportListFilter.setStatus('DRAFT')`                                   |
| Phiếu xuất chờ duyệt     | `GET export-forms?status=PENDING&size=1` → `total` | `EXPORT_FORM_READ`                                   | tab Xuất, `setStatus('PENDING')`; **nổi bật** khi có `EXPORT_FORM_CONFIRM` và số > 0 |
| Vật tư hết / dưới mức    | `stockOverview(useInventory)` → `out + low`        | `MATERIAL_READ` + `WAREHOUSE_READ` (như tab Tồn kho) | tab Tồn kho, `useStockFilter.setLevel('low')`                                        |
| Vật tư vượt mức          | `stockOverview` → `high`                           | như trên                                             | tab Tồn kho, `setLevel('high')`                                                      |

- Dòng **bằng 0 vẫn hiện**, số và nhãn màu xám (muted), vẫn chạm được. Bố cục cố định để dễ quen tay.
- Màu số khi > 0: dưới mức = warning, hết hàng nằm chung dòng dưới mức (theo đúng lọc `low` của tab Tồn kho, vốn gộp `out`); vượt mức = info; phiếu = màu chữ thường, "chờ duyệt" nổi bật = accent.
- Khi chạm: đặt **trạng thái / mức tồn**, đồng thời **xoá ô tìm kiếm và chip lọc** của tab đích (`clearSearch` + `clearChips`; Tồn kho: `reset` rồi `setLevel`) để danh sách khớp đúng con số. _(Quyết định của mình.)_
- Mỗi dòng có trạng thái riêng: đang tải (skeleton/“–”), lỗi (hiện “!” + chạm vẫn điều hướng), có số.

## Thanh tồn kho

Đặt dưới "Việc cần làm", tiêu đề nhỏ "Tồn kho · N vật tư", dùng nguyên component `StockOverview` (chuyển nó sang chỗ dùng chung được — `entities/inventory/ui` hoặc export từ `screens/stock`). Chỉ hiện khi có quyền tồn kho và dữ liệu > 0 vật tư. Chạm thanh → tab Tồn kho không lọc.

## Header

Giống các tab khác (`TabStackLayout`): tiêu đề lớn "Tổng quan", nút đổi kho bên phải (không có nút Lọc). Dòng chào ngắn dưới tiêu đề: "Xin chào, {tên}" + tên kho đang chọn.

## Điều hướng & tab

- `TabKey` thêm `'overview'`, `TAB_ORDER = ['overview', 'import', 'export', 'stock', 'account']`.
- `overview` hiện khi người dùng có **ít nhất một** dòng hiển thị (tức có ít nhất một tab nghiệp vụ).
- `hasBusinessTab` phải **loại trừ cả `overview` và `account`** — nếu không, người dùng không quyền gì vẫn vào tabs thay vì màn "chưa được cấp quyền".
- `hrefFor('tabs')` → `/${tabsFor(user)[0]}` tự thành `/overview` — xác nhận test routing/destination vẫn đúng và cập nhật kỳ vọng.
- Route: `app/(tabs)/overview/_layout.tsx` (`TabStackLayout tab="overview"`) + `index.tsx` → `OverviewScreen` trong `src/screens/overview/`.
- Icon: SF `square.grid.2x2` / `square.grid.2x2.fill`, Material `dashboard`.
- Chuyển tab bằng `router.navigate('/import')` (v.v.) sau khi đặt store; nếu tab đích đang mở màn con (chi tiết phiếu) thì chấp nhận hành vi mặc định của native tabs. _(builder kiểm tra; nếu rơi vào màn con thì `dismissTo` danh sách.)_

## Dữ liệu & làm mới

- Hook đếm mới, ví dụ `useImportFormCount(warehouseSlug, status)` / `useExportFormCount(...)` trong entity tương ứng: gọi API danh sách với `page=1, size=1`, chỉ lấy `total`. Query key nằm dưới key gốc của danh sách phiếu để các mutation hiện có (tạo / xác nhận / huỷ phiếu) invalidate luôn số đếm.
- Tồn kho dùng lại `useInventory(warehouseSlug)` (cùng cache với tab Tồn kho — không tải thêm).
- `enabled` chỉ khi có quyền dòng đó → người không quyền không phát request.
- Kéo để làm mới: refetch tất cả query của màn.
- Đổi kho: query key có `warehouseSlug` nên tự đổi.

## i18n

Namespace mới `overview` (vi + en): tiêu đề, lời chào, nhãn từng dòng (có số nhiều cho en), "Tồn kho · N vật tư", trạng thái lỗi. Thêm `nav:tab.overview` / `nav:overview`.

## Kiểm thử

- `tabs.test.ts`: thứ tự mới, `overview` ẩn/hiện theo quyền, `hasBusinessTab` không bị `overview` làm sai.
- `destination` / routing test: đích mặc định là `/overview`.
- Hook đếm: gọi đúng params (`status`, `size=1`), trả `total`.
- `OverviewScreen`: ẩn dòng theo quyền, dòng 0 vẫn hiện, chạm dòng đặt đúng store + điều hướng đúng route, "chờ duyệt" nổi bật chỉ khi có CONFIRM.
- Jest luôn `--maxWorkers=2`.

## Các quyết định đã tự chốt (để bạn soát)

1. Chạm một dòng **xoá tìm kiếm + chip lọc** của tab đích để danh sách khớp đúng con số.
2. "Hết hàng" gộp vào dòng "dưới mức" (vì bộ lọc `low` của tab Tồn kho vốn gộp như vậy) — không tách dòng riêng.
3. Dòng "Phiếu xuất chờ duyệt" nổi bật chỉ khi người dùng có quyền xác nhận xuất.
4. Lời chào + tên kho dưới tiêu đề; không thêm lối tắt tạo phiếu.
5. Icon tab: grid (`square.grid.2x2` / `dashboard`).

## Để builder tự quyết

Kích thước / khoảng cách cụ thể theo `docs/agents/ui-foundations.md`, skeleton khi tải, chỗ đặt `StockOverview` dùng chung, tên hook cụ thể.

> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# FE — kế hoạch hiệu lực R2

WH-PLAN-20261105-R2 · 1 người/vai trò · estimate từ T0, chưa phải deadline cam kết.

Bắt đầu W01. W00 deliverable đã hoàn thành bởi điều phối; không phải sản phẩm đã test đạt. Xem [gateboard](warehouse-roadmap.html) và [CSV lịch](resource-schedule.csv).

| Task | Effort cơ sở hoặc dự phòng | Dependencies | Trạng thái |
|---|---:|---|---|
| W01-FE | 4–7 | — | NOT_STARTED |
| W02-FE | 26–42 | W02-BE.C | NOT_STARTED |
| W02-FE.F | 3–9 | W02-QA.T | NOT_STARTED |
| W03-FE | 6–10 | W03-BE.C | NOT_STARTED |
| W03-FE.F | 1–2 | W03-QA.T | NOT_STARTED |
| W04-FE | 10–16 | W04-BE.C | NOT_STARTED |
| W04-FE.F | 1–4 | W04-QA.T | NOT_STARTED |
| W05-FE | 10–15 | W05-BE.C | NOT_STARTED |
| W05-FE.F | 1–3 | W05-QA.T | NOT_STARTED |
| W06-FE | 8–13 | W06-BE.C | NOT_STARTED |
| W06-FE.F | 1–3 | W06-QA.T | NOT_STARTED |
| W07-FE | 13–20 | W07-BE.C | NOT_STARTED |
| W07-FE.F | 2–4 | W07-QA.T | NOT_STARTED |
| W08-FE | 8–13 | W08-BE.C | NOT_STARTED |
| W08-FE.F | 1–3 | W08-QA.T | NOT_STARTED |
| W09-FE | 13–21 | W09-BE.C | NOT_STARTED |
| W09-FE.F | 2–5 | W09-QA.T | NOT_STARTED |
| W10-FE | 6–10 | W10-BE.C | NOT_STARTED |
| W10-FE.F | 1–2 | W10-QA.T | NOT_STARTED |
| W11-FE | 7–11 | W11-BE.C | NOT_STARTED |
| W11-FE.F | 1–3 | W11-QA.T | NOT_STARTED |

## W00 — Chốt baseline thiết kế và điều kiện làm việc (rolling wave)

Chốt screen/action/state và wireframe theo Ant Design.

[Hồ sơ giao việc W00](../baseline/dossiers/W00.md).

## W01 — Ổn định gate và dựng harness kiểm thử

Tái lập và sửa full check; dựng browser smoke với API thật.

[Hồ sơ giao việc W01](../baseline/dossiers/W01.md).

## W02 — Nền kiến trúc, quyền, phiên, audit, tệp và quản trị

Ant Design + Redux shell; auth/session, admin, file/audit/backup screens.

[Hồ sơ giao việc W02](../baseline/dossiers/W02.md).

## W03 — Danh mục, kho, vị trí và quy đổi

Các màn catalog đúng schema; search/filter/sort và lỗi tham chiếu.

[Hồ sơ giao việc W03](../baseline/dossiers/W03.md).

## W04 — Nhập, xuất, lô, luân chuyển và sổ giá trị

Wizard nhập/xuất; tồn/lô/trace; cảnh báo, version conflict và trạng thái không giữ chỗ.

[Hồ sơ giao việc W04](../baseline/dossiers/W04.md).

## W05 — Chu trình kiểm kho và điều chỉnh được duyệt

Workspace phân công/ack/count/ảnh/giải trình và approve tách người tạo.

[Hồ sơ giao việc W05](../baseline/dossiers/W05.md).

## W06 — POS, sản phẩm, biến thể và định mức

Product chưa nguồn: empty-state; recipe/version và manual/synced pricing rõ nguồn.

[Hồ sơ giao việc W06](../baseline/dossiers/W06.md).

## W07 — Thu chi kho, thanh toán và công nợ

Chi/thu, attachment purpose, công nợ/đã trả/còn nợ và hoàn từng đợt.

[Hồ sơ giao việc W07](../baseline/dossiers/W07.md).

## W08 — Cảnh báo nghiệp vụ và thông báo

Alert center, ngưỡng/cấu hình và delivery state.

[Hồ sơ giao việc W08](../baseline/dossiers/W08.md).

## W09 — Dashboard, báo cáo và xuất dữ liệu

Dashboard/chart/table/drilldown cùng filter; FULL/PARTIAL và export state.

[Hồ sơ giao việc W09](../baseline/dossiers/W09.md).

## W10 — Import Excel và hợp đồng tích hợp hoàn chỉnh

Wizard upload/preview row errors/confirm và template version.

[Hồ sơ giao việc W10](../baseline/dossiers/W10.md).

## W11 — NFR, hồi quy, UAT và bàn giao local

Responsive, accessibility, dark/light, vi/en và UI performance.

[Hồ sơ giao việc W11](../baseline/dossiers/W11.md).

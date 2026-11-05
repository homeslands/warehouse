> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# BE — kế hoạch hiệu lực R2

WH-PLAN-20261105-R2 · 1 người/vai trò · estimate từ T0, chưa phải deadline cam kết.

Bắt đầu W01. W00 deliverable đã hoàn thành bởi điều phối; không phải sản phẩm đã test đạt. Xem [gateboard](warehouse-roadmap.html) và [CSV lịch](resource-schedule.csv).

| Task | Effort cơ sở hoặc dự phòng | Dependencies | Trạng thái |
|---|---:|---|---|
| W01-BE.I | 4–7 | — | NOT_STARTED |
| W02-BE.C | 3–5 | W01-BE.I | NOT_STARTED |
| W02-BE.I | 37–61 | W02-BE.C, W01-QA.T | NOT_STARTED |
| W02-BE.F | 4–13 | W02-QA.T | NOT_STARTED |
| W03-BE.C | 1–2 | W02-BE.I | NOT_STARTED |
| W03-BE.I | 5–8 | W03-BE.C, W02-QA.R | NOT_STARTED |
| W03-BE.F | 1–2 | W03-QA.T | NOT_STARTED |
| W04-BE.C | 3–5 | W03-BE.I | NOT_STARTED |
| W04-BE.I | 15–23 | W04-BE.C, W03-QA.R | NOT_STARTED |
| W04-BE.F | 2–5 | W04-QA.T | NOT_STARTED |
| W05-BE.C | 2–3 | W04-BE.I | NOT_STARTED |
| W05-BE.I | 10–15 | W05-BE.C, W04-QA.R | NOT_STARTED |
| W05-BE.F | 1–3 | W05-QA.T | NOT_STARTED |
| W06-BE.C | 2–3 | W03-BE.I, W04-BE.I | NOT_STARTED |
| W06-BE.I | 8–13 | W06-BE.C, W03-QA.R, W04-QA.R | NOT_STARTED |
| W06-BE.F | 1–3 | W06-QA.T | NOT_STARTED |
| W07-BE.C | 3–5 | W04-BE.I | NOT_STARTED |
| W07-BE.I | 13–21 | W07-BE.C, W04-QA.R | NOT_STARTED |
| W07-BE.F | 2–5 | W07-QA.T | NOT_STARTED |
| W08-BE.C | 2–3 | W04-BE.I, W05-BE.I, W07-BE.I | NOT_STARTED |
| W08-BE.I | 9–15 | W08-BE.C, W04-QA.R, W05-QA.R, W07-QA.R | NOT_STARTED |
| W08-BE.F | 1–3 | W08-QA.T | NOT_STARTED |
| W09-BE.C | 3–5 | W05-BE.I, W06-BE.I, W07-BE.I, W08-BE.I | NOT_STARTED |
| W09-BE.I | 13–21 | W09-BE.C, W05-QA.R, W06-QA.R, W07-QA.R, W08-QA.R | NOT_STARTED |
| W09-BE.F | 2–5 | W09-QA.T | NOT_STARTED |
| W10-BE.C | 1–2 | W03-BE.I, W04-BE.I, W06-BE.I, W09-BE.I | NOT_STARTED |
| W10-BE.I | 6–9 | W10-BE.C, W03-QA.R, W04-QA.R, W06-QA.R, W09-QA.R | NOT_STARTED |
| W10-BE.F | 1–2 | W10-QA.T | NOT_STARTED |
| W11-BE.C | 1–3 | W02-BE.I, W03-BE.I, W04-BE.I, W05-BE.I, W06-BE.I, W07-BE.I, W08-BE.I, W09-BE.I, W10-BE.I | NOT_STARTED |
| W11-BE.I | 8–12 | W11-BE.C, W02-QA.R, W03-QA.R, W04-QA.R, W05-QA.R, W06-QA.R, W07-QA.R, W08-QA.R, W09-QA.R, W10-QA.R | NOT_STARTED |
| W11-BE.F | 1–3 | W11-QA.T | NOT_STARTED |

## W00 — Chốt baseline thiết kế và điều kiện làm việc (rolling wave)

Chốt typed contract, quyền, dữ liệu và migration policy.

[Hồ sơ giao việc W00](../baseline/dossiers/W00.md).

## W01 — Ổn định gate và dựng harness kiểm thử

Sửa spec lệch DTO; dựng harness migration/seed/race trên DB mới.

[Hồ sơ giao việc W01](../baseline/dossiers/W01.md).

## W02 — Nền kiến trúc, quyền, phiên, audit, tệp và quản trị

Gateway → gRPC Storage; auth/refresh/idle/RBAC, private file, audit/outbox, backup jobs.

[Hồ sơ giao việc W02](../baseline/dossiers/W02.md).

## W03 — Danh mục, kho, vị trí và quy đổi

Catalog đủ trường SDD, supplier chính, vị trí, conversion, threshold, optimistic version.

[Hồ sơ giao việc W03](../baseline/dossiers/W03.md).

## W04 — Nhập, xuất, lô, luân chuyển và sổ giá trị

Nhập/xuất sáu loại; FEFO vật lý, bình quân giá trị; transfer atomic và payable obligation.

[Hồ sơ giao việc W04](../baseline/dossiers/W04.md).

## W05 — Chu trình kiểm kho và điều chỉnh được duyệt

Stocktake lock, hai acknowledgements thật, count, delta và mở khóa atomic.

[Hồ sơ giao việc W05](../baseline/dossiers/W05.md).

## W06 — POS, sản phẩm, biến thể và định mức

Recipe version/archive/copy, cost tách giá; ba API nội bộ và ProductSyncPort. Không live POS.

[Hồ sơ giao việc W06](../baseline/dossiers/W06.md).

## W07 — Thu chi kho, thanh toán và công nợ

Expense/revenue, source links, AP/cash tách biệt, một full settlement và refund installments.

[Hồ sơ giao việc W07](../baseline/dossiers/W07.md).

## W08 — Cảnh báo nghiệp vụ và thông báo

In-app/email, scoped recipients, outbox/dedupe/dead-letter. Không SMS phase này.

[Hồ sơ giao việc W08](../baseline/dossiers/W08.md).

## W09 — Dashboard, báo cáo và xuất dữ liệu

Report summary/watermark, 11 report, custom allowlist, Excel/PDF/CSV và schedule definitions.

[Hồ sơ giao việc W09](../baseline/dossiers/W09.md).

## W10 — Import Excel và hợp đồng tích hợp hoàn chỉnh

XLSX ≤5MiB/1000 dòng; preview rồi atomic CREATE_ONLY, idempotent job.

[Hồ sơ giao việc W10](../baseline/dossiers/W10.md).

## W11 — NFR, hồi quy, UAT và bàn giao local

Sửa NFR, archive/restore test, runbooks và release checklist.

[Hồ sơ giao việc W11](../baseline/dossiers/W11.md).

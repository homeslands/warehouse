> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# QA — kế hoạch hiệu lực R2

WH-PLAN-20261105-R2 · 1 người/vai trò · estimate từ T0, chưa phải deadline cam kết.

Bắt đầu W01. W00 deliverable đã hoàn thành bởi điều phối; không phải sản phẩm đã test đạt. Xem [gateboard](warehouse-roadmap.html) và [CSV lịch](resource-schedule.csv).

| Task | Effort cơ sở hoặc dự phòng | Dependencies | Trạng thái |
|---|---:|---|---|
| W01-QA.D | 2–3 | — | NOT_STARTED |
| W01-QA.T | 3–5 | W01-BE.I, W01-FE, W01-QA.D | NOT_STARTED |
| W02-QA.D | 7–10 | W02-BE.C | NOT_STARTED |
| W02-QA.T | 12–20 | W02-BE.I, W02-FE, W02-QA.D, W01-QA.T | NOT_STARTED |
| W02-QA.R | 2–6 | W02-BE.F, W02-FE.F | NOT_STARTED |
| W03-QA.D | 2–3 | W03-BE.C | NOT_STARTED |
| W03-QA.T | 3–5 | W03-BE.I, W03-FE, W03-QA.D, W02-QA.R | NOT_STARTED |
| W03-QA.R | 1–2 | W03-BE.F, W03-FE.F | NOT_STARTED |
| W04-QA.D | 4–6 | W04-BE.C | NOT_STARTED |
| W04-QA.T | 8–12 | W04-BE.I, W04-FE, W04-QA.D, W03-QA.R | NOT_STARTED |
| W04-QA.R | 2–4 | W04-BE.F, W04-FE.F | NOT_STARTED |
| W05-QA.D | 3–5 | W05-BE.C | NOT_STARTED |
| W05-QA.T | 5–8 | W05-BE.I, W05-FE, W05-QA.D, W04-QA.R | NOT_STARTED |
| W05-QA.R | 1–3 | W05-BE.F, W05-FE.F | NOT_STARTED |
| W06-QA.D | 3–4 | W06-BE.C | NOT_STARTED |
| W06-QA.T | 4–7 | W06-BE.I, W06-FE, W06-QA.D, W03-QA.R, W04-QA.R | NOT_STARTED |
| W06-QA.R | 1–3 | W06-BE.F, W06-FE.F | NOT_STARTED |
| W07-QA.D | 4–6 | W07-BE.C | NOT_STARTED |
| W07-QA.T | 6–10 | W07-BE.I, W07-FE, W07-QA.D, W04-QA.R | NOT_STARTED |
| W07-QA.R | 1–4 | W07-BE.F, W07-FE.F | NOT_STARTED |
| W08-QA.D | 3–4 | W08-BE.C | NOT_STARTED |
| W08-QA.T | 4–7 | W08-BE.I, W08-FE, W08-QA.D, W04-QA.R, W05-QA.R, W07-QA.R | NOT_STARTED |
| W08-QA.R | 1–3 | W08-BE.F, W08-FE.F | NOT_STARTED |
| W09-QA.D | 4–6 | W09-BE.C | NOT_STARTED |
| W09-QA.T | 6–10 | W09-BE.I, W09-FE, W09-QA.D, W05-QA.R, W06-QA.R, W07-QA.R, W08-QA.R | NOT_STARTED |
| W09-QA.R | 1–4 | W09-BE.F, W09-FE.F | NOT_STARTED |
| W10-QA.D | 3–4 | W10-BE.C | NOT_STARTED |
| W10-QA.T | 4–7 | W10-BE.I, W10-FE, W10-QA.D, W03-QA.R, W04-QA.R, W06-QA.R, W09-QA.R | NOT_STARTED |
| W10-QA.R | 1–3 | W10-BE.F, W10-FE.F | NOT_STARTED |
| W11-QA.D | 5–8 | W11-BE.C | NOT_STARTED |
| W11-QA.T | 10–16 | W11-BE.I, W11-FE, W11-QA.D, W02-QA.R, W03-QA.R, W04-QA.R, W05-QA.R, W06-QA.R, W07-QA.R, W08-QA.R, W09-QA.R, W10-QA.R | NOT_STARTED |
| W11-QA.R | 2–5 | W11-BE.F, W11-FE.F | NOT_STARTED |

## W00 — Chốt baseline thiết kế và điều kiện làm việc (rolling wave)

Chốt test basis, fixture và target test riêng; chưa chạy QA ứng dụng.

[Hồ sơ giao việc W00](../baseline/dossiers/W00.md).

## W01 — Ổn định gate và dựng harness kiểm thử

Seed tám actor test đúng scope; chạy lại full gate và lưu log exact SHA/diff.

[Hồ sơ giao việc W01](../baseline/dossiers/W01.md).

## W02 — Nền kiến trúc, quyền, phiên, audit, tệp và quản trị

Kiểm kiến trúc, cookie/CSRF, quyền dọc/ngang, upload, audit/rollback và restore trên test target.

[Hồ sơ giao việc W02](../baseline/dossiers/W02.md).

## W03 — Danh mục, kho, vị trí và quy đổi

Kiểm constraint/FK, unit precision, effective thresholds, quyền và trường bắt buộc.

[Hồ sơ giao việc W03](../baseline/dossiers/W03.md).

## W04 — Nhập, xuất, lô, luân chuyển và sổ giá trị

Race confirm, rollback, FEFO/rounding, transfer không sinh chi và chống trùng obligation.

[Hồ sơ giao việc W04](../baseline/dossiers/W04.md).

## W05 — Chu trình kiểm kho và điều chỉnh được duyệt

Hai user riêng; khóa nhập/xuất; threshold >5/>10 và complete/cancel race.

[Hồ sơ giao việc W05](../baseline/dossiers/W05.md).

## W06 — POS, sản phẩm, biến thể và định mức

Kiểm recipe, cost và core API; fake adapter có nhãn SIMULATED, FUT-POS chưa nghiệm thu.

[Hồ sơ giao việc W06](../baseline/dossiers/W06.md).

## W07 — Thu chi kho, thanh toán và công nợ

Đối soát VAT/AP/cash/AR; DEBT confirm không cash; COD/retry không trả hai lần.

[Hồ sơ giao việc W07](../baseline/dossiers/W07.md).

## W08 — Cảnh báo nghiệp vụ và thông báo

Boundary min/max/expiry/price, sau commit, rollback không gửi; local mail capture.

[Hồ sơ giao việc W08](../baseline/dossiers/W08.md).

## W09 — Dashboard, báo cáo và xuất dữ liệu

Đối soát ledger với reports và file thật; không zero-fill dữ liệu legacy thiếu cost.

[Hồ sơ giao việc W09](../baseline/dossiers/W09.md).

## W10 — Import Excel và hợp đồng tích hợp hoàn chỉnh

Một dòng lỗi không ghi gì; retry không trùng; import phiếu chỉ tạo DRAFT.

[Hồ sơ giao việc W10](../baseline/dossiers/W10.md).

## W11 — NFR, hồi quy, UAT và bàn giao local

Chạy NFR và hồi quy; uptime/TLS/vận hành thật giữ gate riêng, chưa công bố PASS từ local.

[Hồ sơ giao việc W11](../baseline/dossiers/W11.md).

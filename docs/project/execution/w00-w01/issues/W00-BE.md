> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

<!-- warehouse-plan:WH-PLAN-W00-W01-20261105-R1:W00-BE -->
# W00-BE — Bàn giao contract API, dữ liệu, quyền và migration

Parent: https://github.com/homeslands/warehouse/issues/156. Plan: WH-PLAN-W00-20261105-R1, APPROVED theo quyền điều phối05/11/2026. Baseline: WH-DEC-20261105-R2; source SHA `384c53d9f9c81d320793069b3dffd690ae88c0af` + WIP fingerprint lúc nhận việc.

## Mục tiêu và phạm vi

Bàn giao contract API, dữ liệu, quyền và migration. Vị trí BE01; chưa có tên người/assignee, không giả đã bắt đầu. Phase P1; effort0–0ngày công. Ánh xạ tracker: `W00-BE`.

Ownership: Hồ sơ local W00; chỉ đọc app/warehouse-api; không sửa source upload của worker khác.

Phụ thuộc: Không có task code trước; đọc baseline R2 trước khi nhận việc.

## Microtask và tiến độ

- [x] **W00-BE-M01** — Ghi nhận contract API/gRPC/quyền đã hoàn thành ở R2. Đầu ra: SRC-01 và contracts/. Đạt khi: Ref và hash còn đúng; không gọi design validation là API PASS.
- [x] **W00-BE-M02** — Ghi nhận data dictionary, transaction và migration policy. Đầu ra: 339 field occurrences; data-and-migration.md. Đạt khi: Không sửa migration đã chạy; migration047 thuộc worker upload.
- [x] **W00-BE-M03** — Chốt phạm vi giao W01 và phân biệt legacy với v1. Đầu ra: Issue W01-BE-01/02. Đạt khi: Sửa spec/harness; giữ compatibility; v1/gRPC thuộc W02.
- [x] **W00-BE-M04** — Đưa hồ sơ bàn giao vào issue có liên kết chéo. Đầu ra: Issue body và issue-map. Đạt khi: Link parent/child hợp lệ, có acceptance và hash baseline.
- [ ] **W00-BE-M05** — BE thực nhận và ghi SHA/diff/owner. Đầu ra: Biên bản nhận việc. Đạt khi: Tên người thực hiện thật, actual_start khi bắt đầu W01; chưa có thì giữ pending.

## Đầu ra và điều kiện nghiệm thu

- Contract/API/gRPC/data index có hash
- Biên bản tiếp nhận BE và ownership

- Giữ nguyên WH-DEC-20261105-R2; 161operations/84schemas là target, chưa phải API đang chạy.
- BE nhận đúng source baseline và giới hạn W01; không làm foundation W02 trước gate.

## Quy tắc evidence và bàn giao

Node24; ghi exact command/exit, SHA+dirtydiff, target ID/fixture version, expected/actual, log/file SHA256 và defects. Thiết kế/unit/API thật/browser/deploy là mức bằng chứng riêng. Không đổi source ngoài ownership, không `.env`, DB hiện hữu, CI/CD, deploy, commit/push trong scope phát hành plan/issue. Implementation branch/PR cần task nhận việc và quyền tương ứng.

Các dòng [x] ở W00 chỉ là hồ sơ R2 đã có bằng chứng, không phải code mới thực hiện. Mọi code/test W01 là NOT_STARTED/NOT_RUN khi phát hành. Không đăng password/token/private target config trong issue.

## Baseline tối thiểu phải giữ

Baseline WH-DEC-20261105-R2 (37 quyết định APPROVED theo ủy quyền điều phối). POS thật và SMS phase sau; gRPC/Ant Design foundation thuộc W02. W00 đã hoàn thành hồ sơ, chưa có package product acceptance. W01 sửa gate và dựng harness trên test target mới; không dùng DB hiện hữu, `.env`, CI/CD hoặc deploy.

Đội1BE:1FE:1Tester; vị trí BE01/FE01/QA01, chưa tự gán tên/assignee. WIP upload hiện hữu giữ ownership file module/authority/main/lint và migration047, không giao trùng.

R2 là thiết kế đích: /api/v1 typed contracts chưa phải endpoint đang chạy. W01 smoke dùng legacy API thực tế (POST /auth/login, GET /auth/me, GET /warehouses); không kiểm future API bằng mock rồi báo tích hợpPASS. Refresh-cookie/idle/fullRBAC kiến trúc đích kiểm ở W02 sau implement.

Nguồn: SRC-01 SHA256 `a2f836650b3ced1b4b29a3bb8c03b55d29ca6b7ec74e2e616a59b8c758f9e070`; SRC-05 SHA256 `63669bfa727f31b8f2226656553f9a712b4db46ad9318ad7533ec6b3dd529234`; SRC-06 SHA256 `d78e5a2c5c021431b1128478a77470c24884d54117d95368ffb911d2a4825470`; SRC-07 SHA256 `20fd89e74b7c8e7b76240a2b8346cee60b8ff8dc70667613d5de7e6a69f9e1e6`; SRC-08 SHA256 `bcd5421891a9124d9e03abd77372204ac9efec3b3a1c84d2d0db0315140e8314`

> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

<!-- warehouse-plan:WH-PLAN-W00-W01-20261105-R1:W00-FE -->
# W00-FE — Bàn giao screen contract, trạng thái UI và phạm vi frontend

Parent: https://github.com/homeslands/warehouse/issues/156. Plan: WH-PLAN-W00-20261105-R1, APPROVED theo quyền điều phối05/11/2026. Baseline: WH-DEC-20261105-R2; source SHA `384c53d9f9c81d320793069b3dffd690ae88c0af` + WIP fingerprint lúc nhận việc.

## Mục tiêu và phạm vi

Bàn giao screen contract, trạng thái UI và phạm vi frontend. Vị trí FE01; chưa có tên người/assignee, không giả đã bắt đầu. Phase P1; effort0–0ngày công. Ánh xạ tracker: `W00-FE`.

Ownership: Hồ sơ local W00; chỉ đọc app/warehouse-ui; không chuyển toàn UI sang AntD trong W01.

Phụ thuộc: Không có task code trước; đọc baseline R2 trước khi nhận việc.

## Microtask và tiến độ

- [x] **W00-FE-M01** — Ghi nhận screen/action/state và schema target. Đầu ra: screen-contracts.json. Đạt khi: 32 màn có action/role/state; wireframe không là browser evidence.
- [x] **W00-FE-M02** — Ghi nhận responsive/token và quy tắc lỗi. Đầu ra: design-tokens.json và screen-contracts.md. Đạt khi: 401/403/409/offline đúng contract; FE không thay backend RBAC.
- [x] **W00-FE-M03** — Chốt các task FE W01 và cách lưu test evidence. Đầu ra: W01-FE-01/02. Đạt khi: Không mock HTTP trong smoke tích hợp thật, không bật capability chưa có API.
- [x] **W00-FE-M04** — Phát hành checklist/issue và liên kết API harness. Đầu ra: Issue map. Đạt khi: Phụ thuộc BE-02 rõ; ghi browser API target và fixture version.
- [ ] **W00-FE-M05** — FE thực nhận ownership và ghi người làm. Đầu ra: Biên bản nhận việc. Đạt khi: Tên người thật; không tự gán assignee GitHub khi chưa biết.

## Đầu ra và điều kiện nghiệm thu

- Screen/action/state index
- Biên bản tiếp nhận FE

- 32screen/7archetype là thiết kế; ảnh fixture không phải live API.
- Giữ AntD/Redux ở đích W02, FSD/vi-en/dark-light; W01 chỉ sửa gate và smoke.

## Quy tắc evidence và bàn giao

Node24; ghi exact command/exit, SHA+dirtydiff, target ID/fixture version, expected/actual, log/file SHA256 và defects. Thiết kế/unit/API thật/browser/deploy là mức bằng chứng riêng. Không đổi source ngoài ownership, không `.env`, DB hiện hữu, CI/CD, deploy, commit/push trong scope phát hành plan/issue. Implementation branch/PR cần task nhận việc và quyền tương ứng.

Các dòng [x] ở W00 chỉ là hồ sơ R2 đã có bằng chứng, không phải code mới thực hiện. Mọi code/test W01 là NOT_STARTED/NOT_RUN khi phát hành. Không đăng password/token/private target config trong issue.

## Baseline tối thiểu phải giữ

Baseline WH-DEC-20261105-R2 (37 quyết định APPROVED theo ủy quyền điều phối). POS thật và SMS phase sau; gRPC/Ant Design foundation thuộc W02. W00 đã hoàn thành hồ sơ, chưa có package product acceptance. W01 sửa gate và dựng harness trên test target mới; không dùng DB hiện hữu, `.env`, CI/CD hoặc deploy.

Đội1BE:1FE:1Tester; vị trí BE01/FE01/QA01, chưa tự gán tên/assignee. WIP upload hiện hữu giữ ownership file module/authority/main/lint và migration047, không giao trùng.

R2 là thiết kế đích: /api/v1 typed contracts chưa phải endpoint đang chạy. W01 smoke dùng legacy API thực tế (POST /auth/login, GET /auth/me, GET /warehouses); không kiểm future API bằng mock rồi báo tích hợpPASS. Refresh-cookie/idle/fullRBAC kiến trúc đích kiểm ở W02 sau implement.

Nguồn: SRC-01 SHA256 `a2f836650b3ced1b4b29a3bb8c03b55d29ca6b7ec74e2e616a59b8c758f9e070`; SRC-05 SHA256 `63669bfa727f31b8f2226656553f9a712b4db46ad9318ad7533ec6b3dd529234`; SRC-06 SHA256 `d78e5a2c5c021431b1128478a77470c24884d54117d95368ffb911d2a4825470`; SRC-07 SHA256 `20fd89e74b7c8e7b76240a2b8346cee60b8ff8dc70667613d5de7e6a69f9e1e6`; SRC-08 SHA256 `bcd5421891a9124d9e03abd77372204ac9efec3b3a1c84d2d0db0315140e8314`

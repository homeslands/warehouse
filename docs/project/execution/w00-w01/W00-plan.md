> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# WH-PLAN-W00-20261105-R1 — Kế hoạch riêng W00

## 1. Kiểm soát tài liệu

Phiên bản R1 · Ngày05/11/2026 · APPROVED FOR EXECUTION PLANNING · Codex — Điều phối theo ủy quyền người dùng ngày 05/11/2026.

Người lập/phê duyệt: điều phối theo ủy quyền. Không tạo chữ ký người dùng hoặc verdict review độc lập. Tài liệu nội bộ DEV LOCAL; issue là bản tóm tắt công việc được phép công bố.

Baseline: WH-DEC-20261105-R2; SHA256 `a2f836650b3ced1b4b29a3bb8c03b55d29ca6b7ec74e2e616a59b8c758f9e070`. Repo homeslands/warehouse. Mọi thay đổi nội dung kiểm soát bằng revision, không sửa evidence đã khóa.

## 2. Mục đích, phạm vi và ranh giới

Baseline WH-DEC-20261105-R2 (37 quyết định APPROVED theo ủy quyền điều phối). POS thật và SMS phase sau; gRPC/Ant Design foundation thuộc W02. W00 đã hoàn thành hồ sơ, chưa có package product acceptance. W01 sửa gate và dựng harness trên test target mới; không dùng DB hiện hữu, `.env`, CI/CD hoặc deploy.

Đội1BE:1FE:1Tester; vị trí BE01/FE01/QA01, chưa tự gán tên/assignee. WIP upload hiện hữu giữ ownership file module/authority/main/lint và migration047, không giao trùng.

R2 là thiết kế đích: /api/v1 typed contracts chưa phải endpoint đang chạy. W01 smoke dùng legacy API thực tế (POST /auth/login, GET /auth/me, GET /warehouses); không kiểm future API bằng mock rồi báo tích hợpPASS. Refresh-cookie/idle/fullRBAC kiến trúc đích kiểm ở W02 sau implement.

W00: tài liệu đã hoàn thành; còn tiếp nhận theo vai trò. W01: công việc sửa gate/harness được lập kế hoạch, chưa thực hiện source/test trong lần phát hành issue này.

## 3. Phase và điều kiện chuyển phase

| Phase | Mô tả | Entry → Exit | Trạng thái |
|---|---|---|---|
| P0 | Thiết kế và quyết định | Nguồn thiết kế gốc và ủy quyền điều phối → 37 quyết định R2 và hồ sơ BE/FE/Tester có hash | COMPLETE_DOCUMENTATION |
| P1 | Bàn giao và phân công | P0 hồ sơ đã chốt → Issue đầy đủ, owner tiếp nhận phạm vi và bằng chứng cần nộp | ISSUES_PUBLISHED_RECEIPT_PENDING |
| P2 | Ổn định gate BE/FE | Đọc R2, ghi SHA/diff và runtime → Full gate tái lập được; sửa có nguyên nhân; không hạ tiêu chí | NOT_STARTED |
| P3 | Implement harness API/DB/browser | Sửa gate và test basis/target đã cấp → Migration/seed/reset/race helpers và browser smoke chạy với API thật | NOT_STARTED |
| P4 | Kiểm chứng và nghiệm thu | Hợp nhất đúng diff, harness và smoke có thể chạy → QA đạt, review code độc lập, E02b verified, owner acceptance có thật | NOT_STARTED |

## 4. WBS, trách nhiệm và tiến độ

| Task | Role | Effort | Dependencies | Status | Issue |
|---|---|---:|---|---|---|
| W00-BE | BE | 0–0 | — | DOCUMENTATION_COMPLETE_RECEIPT_PENDING | https://github.com/homeslands/warehouse/issues/158 |
| W00-FE | FE | 0–0 | — | DOCUMENTATION_COMPLETE_RECEIPT_PENDING | https://github.com/homeslands/warehouse/issues/159 |
| W00-QA | QA | 0–0 | — | DOCUMENTATION_COMPLETE_RECEIPT_PENDING | https://github.com/homeslands/warehouse/issues/160 |

Effort W00 còn lại được tính trong đọc/nhận scope đầu W01, không tính lại phần tài liệu đã làm. W01 BE4–7/FE4–7/QA5–8ngày công. Dependencies browser thật cho cửa sổ8–14ngày làm việc; chưa chốt T0/deadline. Đây là refinement từ cửa sổ7–12 của mô hình tổng quát R2, cùng effort; không tự ghi actual hoặc thay project forecast239–419.

## 5. Task và microtask

### W00-BE — Bàn giao contract API, dữ liệu, quyền và migration

Ownership: Hồ sơ local W00; chỉ đọc app/warehouse-api; không sửa source upload của worker khác.

- [x] **W00-BE-M01** — Ghi nhận contract API/gRPC/quyền đã hoàn thành ở R2. Đầu ra: SRC-01 và contracts/. Đạt khi: Ref và hash còn đúng; không gọi design validation là API PASS.
- [x] **W00-BE-M02** — Ghi nhận data dictionary, transaction và migration policy. Đầu ra: 339 field occurrences; data-and-migration.md. Đạt khi: Không sửa migration đã chạy; migration047 thuộc worker upload.
- [x] **W00-BE-M03** — Chốt phạm vi giao W01 và phân biệt legacy với v1. Đầu ra: Issue W01-BE-01/02. Đạt khi: Sửa spec/harness; giữ compatibility; v1/gRPC thuộc W02.
- [x] **W00-BE-M04** — Đưa hồ sơ bàn giao vào issue có liên kết chéo. Đầu ra: Issue body và issue-map. Đạt khi: Link parent/child hợp lệ, có acceptance và hash baseline.
- [ ] **W00-BE-M05** — BE thực nhận và ghi SHA/diff/owner. Đầu ra: Biên bản nhận việc. Đạt khi: Tên người thực hiện thật, actual_start khi bắt đầu W01; chưa có thì giữ pending.

Đầu ra: Contract/API/gRPC/data index có hash; Biên bản tiếp nhận BE và ownership.

Acceptance: Giữ nguyên WH-DEC-20261105-R2; 161operations/84schemas là target, chưa phải API đang chạy.; BE nhận đúng source baseline và giới hạn W01; không làm foundation W02 trước gate..

### W00-FE — Bàn giao screen contract, trạng thái UI và phạm vi frontend

Ownership: Hồ sơ local W00; chỉ đọc app/warehouse-ui; không chuyển toàn UI sang AntD trong W01.

- [x] **W00-FE-M01** — Ghi nhận screen/action/state và schema target. Đầu ra: screen-contracts.json. Đạt khi: 32 màn có action/role/state; wireframe không là browser evidence.
- [x] **W00-FE-M02** — Ghi nhận responsive/token và quy tắc lỗi. Đầu ra: design-tokens.json và screen-contracts.md. Đạt khi: 401/403/409/offline đúng contract; FE không thay backend RBAC.
- [x] **W00-FE-M03** — Chốt các task FE W01 và cách lưu test evidence. Đầu ra: W01-FE-01/02. Đạt khi: Không mock HTTP trong smoke tích hợp thật, không bật capability chưa có API.
- [x] **W00-FE-M04** — Phát hành checklist/issue và liên kết API harness. Đầu ra: Issue map. Đạt khi: Phụ thuộc BE-02 rõ; ghi browser API target và fixture version.
- [ ] **W00-FE-M05** — FE thực nhận ownership và ghi người làm. Đầu ra: Biên bản nhận việc. Đạt khi: Tên người thật; không tự gán assignee GitHub khi chưa biết.

Đầu ra: Screen/action/state index; Biên bản tiếp nhận FE.

Acceptance: 32screen/7archetype là thiết kế; ảnh fixture không phải live API.; Giữ AntD/Redux ở đích W02, FSD/vi-en/dark-light; W01 chỉ sửa gate và smoke..

### W00-QA — Bàn giao test basis, fixture và grant môi trường test

Ownership: Hồ sơ test/bằng chứng local; chưa chạy migration hoặc ghi DB trong task lập kế hoạch này.

- [x] **W00-QA-M01** — Ghi nhận test basis và truy vết R2. Đầu ra: Test basis464case và230trace rows. Đạt khi: Không coi số liên kết là mọi nhánh đã PASS.
- [x] **W00-QA-M02** — Ghi nhận fixture8actor/3kho và target grant. Đầu ra: SRC-06/07. Đạt khi: Password/token không ghi trong issue; lấy token bằng login thật sau bootstrap.
- [x] **W00-QA-M03** — Chốt ma trận riêng cho W01 và giới hạn smoke. Đầu ra: test-matrix.csv. Đạt khi: Có expected/evidence/owner; basic RBAC không thay full auth/RBAC W02.
- [x] **W00-QA-M04** — Phát hành issue QA và protocol E02b. Đầu ra: Issue QA-01/02. Đạt khi: Test design khác test result; E02b chỉ verified sau run thật.
- [ ] **W00-QA-M05** — Tester thực nhận và chốt run identifier. Đầu ra: Biên bản nhận việc. Đạt khi: Tên người thật, target handle và SHA/diff trước khi chạy.

Đầu ra: Test basis/fixture/target protocol; Biên bản tiếp nhận Tester.

Acceptance: 464case ở R2 vẫn DESIGNED_NOT_RUN; W01 có case harness riêng.; Grant target mới không cho phép truy cập DB hiện hữu hoặc công bố RBAC đạt từ JSONfixture..

## 6. Verification, validation và nghiệm thu

Case W01-TC01..12 ở test-matrix.csv, tất cả NOT_RUN. API/DB thật không được thay bằng mock; probe DB và helper race chỉ xác minh hạ tầng, không thay business transaction tests W04. W02 foundation/auth/RBAC đầy đủ kiểm sau implement.

Mỗi handoff: SHA/diff, lệnh/exits, môi trường/fixture, expected/actual, loghash, defects, independent code review và owner acceptance. Reviewer không phải người viết. Trong đội1:1:1 có thể BE/FE peer-review; không thêm nhân sự giả.

## 7. Theo dõi, rủi ro và kiểm soát thay đổi

Checkpoint đầu/cuối ngày làm việc do người phụ trách ghi thủ công; không scheduler. Trạng thái issue khác tiến độ code và package acceptance. Không tự tăng phần trăm từ số dòng code; dùng microtask hoàn thành có bằng chứng và effort còn lại theo từng role.

Rủi ro: log audit cũ, concurrency/cleanup UI chưa biết root cause, app bootstrap có side effect/cron/outbox, migration legacy có thể không chạy sạch, API+browser chung resource, WIP khác. Mitigation: tái lập trên exact diff, config test fail-closed, tắt external transports/scheduled jobs trong composition test, target allowlist, không sửa migration đã chạy; defect ngoài scope có owner/CR.

## 8. Tài liệu nguồn và truy vết

- SRC-01 — Baseline quyết định R2; SHA256 `a2f836650b3ced1b4b29a3bb8c03b55d29ca6b7ec74e2e616a59b8c758f9e070`; đường dẫn local tương đối `.agents/tasks/preimplementation-gates-20261105/approvals/r2/decision-pack.json` (không có trên GitHub).
- SRC-02 — Kế hoạch R2 đội1:1:1; SHA256 `4e2297e24a97da80ef0df80739e9f1eef2d63113332940467d512717a95bddb5`; đường dẫn local tương đối `.agents/tasks/preimplementation-gates-20261105/planning/plan.json` (không có trên GitHub).
- SRC-03 — Gate và bằng chứng; SHA256 `a3cdc81a6e40177766dcec4941bf38d85fb8849f7e6e94f1231ae3d15f9e719c`; đường dẫn local tương đối `.agents/tasks/preimplementation-gates-20261105/gates.json` (không có trên GitHub).
- SRC-04 — Dossier W00; SHA256 `87d10bea82cf212635efa152b11f609f4234b970287f7b7e1e6603b0789fe275`; đường dẫn local tương đối `.agents/tasks/preimplementation-gates-20261105/dossiers/W00.json` (không có trên GitHub).
- SRC-05 — Dossier W01; SHA256 `63669bfa727f31b8f2226656553f9a712b4db46ad9318ad7533ec6b3dd529234`; đường dẫn local tương đối `.agents/tasks/preimplementation-gates-20261105/dossiers/W01.json` (không có trên GitHub).
- SRC-06 — Fixture 8actor/3kho; SHA256 `d78e5a2c5c021431b1128478a77470c24884d54117d95368ffb911d2a4825470`; đường dẫn local tương đối `.agents/tasks/preimplementation-gates-20261105/qa/fixture-plan.json` (không có trên GitHub).
- SRC-07 — Grant test local; SHA256 `20fd89e74b7c8e7b76240a2b8346cee60b8ff8dc70667613d5de7e6a69f9e1e6`; đường dẫn local tương đối `.agents/tasks/preimplementation-gates-20261105/environment/HANDOFF.md` (không có trên GitHub).
- SRC-08 — Carryover upload; SHA256 `bcd5421891a9124d9e03abd77372204ac9efec3b3a1c84d2d0db0315140e8314`; đường dẫn local tương đối `.agents/tasks/preimplementation-gates-20261105/carryover-alignment.md` (không có trên GitHub).
- SRC-09 — Audit API compile cũ; SHA256 `0e330d011e92d3cc6354a8cd941ed5114a9c088e5dd6478634356914b01e8767`; đường dẫn local tương đối `.agents/tasks/audit-20261104/evidence/api-typecheck.log` (không có trên GitHub).
- SRC-10 — Audit UI full check cũ; SHA256 `dddce18843cea07d8f45e16ec8c83c0932e312ec0d2ea09d5c82a7ca58860ade`; đường dẫn local tương đối `.agents/tasks/audit-20261104/evidence/ui-check.log` (không có trên GitHub).

## 9. ISO tailoring

- [ISO/IEC/IEEE 15289:2019](https://www.iso.org/standard/74909.html): Tổ chức mục đích, nội dung và kiểm soát hồ sơ vòng đời; mã tài liệu, phiên bản, nguồn, trách nhiệm và đầu ra.
- [ISO/IEC/IEEE 29148:2018](https://www.iso.org/standard/72089.html): Nguồn yêu cầu, truy vết sang task/case, acceptance criteria và kiểm soát thay đổi yêu cầu.
- [ISO/IEC/IEEE 29119-3:2021](https://www.iso.org/standard/79429.html): Test plan, test design, case/procedure, execution record, incident và test completion report.
- [ISO 21502:2020](https://www.iso.org/standard/74947.html): Lập WBS, trách nhiệm, phụ thuộc, nguồn lực, mốc, rủi ro và báo cáo tiến độ.

Các mục này là lựa chọn cấu trúc hồ sơ của dự án theo phạm vi công khai của tiêu chuẩn. Không tự gán clause hoặc tuyên bố chứng nhận/tuân thủ đầy đủ khi chưa đánh giá chính thức.

## 10. Lịch sử và phê duyệt

R1,05/11/2026: điều phối phê duyệt phân rã W00/W01 và phát hành issue theo yêu cầu người dùng. Bổ sung dependency smoke thật; không thay thiết kế R2 hoặc ghi product PASS.

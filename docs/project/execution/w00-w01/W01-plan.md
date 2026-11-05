> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# WH-PLAN-W01-20261105-R1 — Kế hoạch riêng W01

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
| W01-BE-01 | BE | 1–2 | — | NOT_STARTED | https://github.com/homeslands/warehouse/issues/161 |
| W01-BE-02 | BE | 3–5 | W01-BE-01 | NOT_STARTED | https://github.com/homeslands/warehouse/issues/162 |
| W01-FE-01 | FE | 3–5 | — | NOT_STARTED | https://github.com/homeslands/warehouse/issues/163 |
| W01-FE-02 | FE | 1–2 | W01-FE-01, W01-BE-02 | NOT_STARTED | https://github.com/homeslands/warehouse/issues/164 |
| W01-QA-01 | QA | 2–3 | — | NOT_STARTED | https://github.com/homeslands/warehouse/issues/165 |
| W01-QA-02 | QA | 3–5 | W01-QA-01, W01-BE-02, W01-FE-02 | NOT_STARTED | https://github.com/homeslands/warehouse/issues/166 |

Effort W00 còn lại được tính trong đọc/nhận scope đầu W01, không tính lại phần tài liệu đã làm. W01 BE4–7/FE4–7/QA5–8ngày công. Dependencies browser thật cho cửa sổ8–14ngày làm việc; chưa chốt T0/deadline. Đây là refinement từ cửa sổ7–12 của mô hình tổng quát R2, cùng effort; không tự ghi actual hoặc thay project forecast239–419.

## 5. Task và microtask

### W01-BE-01 — Sửa compile/spec lệch DTO và khôi phục gate backend

Ownership: app/warehouse-api/src/warehouse/warehouse.service.spec.ts; file test thực sự lỗi sau tái lập. Không sửa .eslintrc.js/main.ts/file module WIP.

- [ ] **W01-BE-01-M01** — Đọc DTO/mapper và ghi baseline lỗi thật. Đầu ra: Repro trên Node24, SHA+dirtydiff. Đạt khi: So log04/11 với trạng thái hiện tại; không gọi lỗi cũ là live FAIL.
- [ ] **W01-BE-01-M02** — Đối chiếu5 lỗi TS2339 tại spec296-298/830/840. Đầu ra: Bảng assertion → DTO thực. Đạt khi: Chốt manager/store nested contract hiện có, không ép kiểu any để né lỗi.
- [ ] **W01-BE-01-M03** — Sửa assertion và fixture test tối thiểu. Đầu ra: Diff warehouse.service.spec.ts. Đạt khi: Kiểm cùng hành vi DTO hiện hành, không xóa assertion nghiệp vụ.
- [ ] **W01-BE-01-M04** — Chạy target spec rồi full unit/typecheck/lint/build không fix. Đầu ra: Evidence commands/exits. Đạt khi: Không skip suite; build dùng nest build riêng để tránh npm build gọi lint--fix.
- [ ] **W01-BE-01-M05** — Đối soát WIP và bàn giao QA/peer review. Đầu ra: Handoff exact diff và log hash. Đạt khi: Không sửa file worker upload; lỗi ngoài scope thành defect có owner.

Đầu ra: Repro log; Diff spec tối thiểu; Full unit/typecheck/lint/build logs.

Acceptance: Không thêm lại managerSlug/storeSlug/storeName vào production DTO chỉ để làm xanh spec.; Full unit suite và cả production/test typecheck không lỗi; giữ contract nghiệp vụ..

### W01-BE-02 — Implement harness API + DB, migration/seed/reset và helper race

Ownership: app/warehouse-api/test/** và test config mới; cấu hình test riêng nếu cần trong src/config dưới ownership rõ. Không .env, không sửa migration047 hay migration đã chạy.

- [ ] **W01-BE-02-M01** — Thiết kế harness entry point và kiểm config không đọc.env. Đầu ra: Test-only config/DataSource và fail-closed guard. Đạt khi: Sai DB/container/name thì dừng trước connect/write; cấm prod config fallback.
- [ ] **W01-BE-02-M02** — Cấu hình Jest e2e và src alias đúng root. Đầu ra: jest-e2e config. Đạt khi: test:e2e tìm thấy test, không chấp nhận no tests found.
- [ ] **W01-BE-02-M03** — Chạy migration/seed trên target test mới được cấp. Đầu ra: Migration history + fixture manifest. Đạt khi: Không dùng npm typeorm:r với config mặc định đọc dotenv; không synchronize.
- [ ] **W01-BE-02-M04** — Implement reset/cleanup, seed idempotent và privacy logs. Đầu ra: Helpers + rerun evidence. Đạt khi: Reset giới hạn target, không truncate DB khác; không log secret.
- [ ] **W01-BE-02-M05** — Implement login/me/warehouse-list/deny và DB transaction/race smoke. Đầu ra: Case W01-TC01..08. Đạt khi: Guards thật; Supervisor chỉ thấy kho của mình, thiếu quyền bị403; fixture khôngSUPER_ADMIN.
- [ ] **W01-BE-02-M06** — Kiểm client helper hai connection/barrier và rollback. Đầu ra: Race/rollback evidence. Đạt khi: Ghi rõ infrastructure helper khác business confirm race W04; không báo tồn kho race PASS.
- [ ] **W01-BE-02-M07** — Bàn giao endpoint/baseURL, reset và reviewed diff. Đầu ra: Handoff cho FE/QA. Đạt khi: Private credential ngoài issue; worker upload được giữ nguyên.

Đầu ra: Test-only DataSource/app config; Migration/seed/reset helpers; API e2e + transaction/race smoke; Harness runbook.

Acceptance: Target allowlist + container ownership check; cấm synchronize và không import dotenv hiện hữu.; Test thật dùng AppModule/guard/DB/Redis đúng composition; không override guard/repository để giả tích hợp.; Migration vào DB mới có history log; chạy seed/reset hai lần không tạo trùng; token qua login thật..

### W01-FE-01 — Tái lập và ổn định full check frontend

Ownership: Các file test/import-export thực sự lỗi; vite.config.ts chỉ khi chứng minh nguyên nhân pool/isolation. Không sửa capability/API/role nghiệp vụ để né test.

- [ ] **W01-FE-01-M01** — Chạy full check tái lập với Node24 và lưu resource/worker settings. Đầu ra: Run manifest. Đạt khi: 43 lỗi04/11 là snapshot; ghi kết quả mới đúng actual.
- [ ] **W01-FE-01-M02** — Phân nhóm timeout và lỗi tìm control, đọc source/test. Đầu ra: Failure catalogue. Đạt khi: Phân biệt tranh chấp tài nguyên, cleanup, async/UI regression bằng repro.
- [ ] **W01-FE-01-M03** — Sửa fixture/cleanup/async hoặc UI bug có căn cứ. Đầu ra: Diff nhỏ theo nhóm lỗi. Đạt khi: Không đổi API/permission/rules đã chốt; vi phạm R2 ngoài W01 phải có defect/CR.
- [ ] **W01-FE-01-M04** — Nếu chỉnh worker/isolation, đo và ghi lý do. Đầu ra: Config comparison. Đạt khi: Không tăng timeout/ẩn lỗi; budget tài nguyên lặp lại được.
- [ ] **W01-FE-01-M05** — Chạy full check và peer review diff cuối. Đầu ra: Lint/typecheck/coverage/build/format evidence. Đạt khi: Mọi bước PASS cùng SHA/diff, không dùng exit0 của wrapper che lệnh con lỗi.

Đầu ra: Failure catalogue; Nguyên nhân + diff sửa; Full npm run check log.

Acceptance: Chạy full check; rerun7file245tests không thay full gate.; Không tăng timeout, hạ coverage, skip/flaky retry để che FAIL; giữ FSD, vi/en, dark/light..

### W01-FE-02 — Implement browser smoke đăng nhập và danh sách với API thật

Ownership: app/warehouse-ui/e2e/**, playwright.config.ts và package/lock nếu thêm test runner. Tránh chạm production API/cache ngoài lỗi được giao.

- [ ] **W01-FE-02-M01** — Chốt smoke case, baseURL/ports và fixture interface với BE. Đầu ra: Smoke config contract. Đạt khi: Nêu API legacy chính xác; không hardcode password/token trong test/repo.
- [ ] **W01-FE-02-M02** — Thêm browser test runner/config và script nếu chưa có. Đầu ra: Package/lock + isolated e2e dir. Đạt khi: Không đổi Node hoặc upgrade app để né incompatibility; không CI config.
- [ ] **W01-FE-02-M03** — Implement login + danh sách kho bằng API thật. Đầu ra: W01-TC09/10. Đạt khi: Không stub network; chụp API target/fixtureversion/actor alias không lộ token.
- [ ] **W01-FE-02-M04** — Implement auth-negative, warehouse scope và logout smoke. Đầu ra: W01-TC11. Đạt khi: User thường/thiếu quyền; scope chéo không lộ data; không dùng SUPER_ADMIN bypass.
- [ ] **W01-FE-02-M05** — Chạy desktop1440/mobile390, lưu trace/screenshot và handoff. Đầu ra: Browser evidence + exact diff. Đạt khi: Fixture UI unit/mock chỉ ghi riêng; failed test không bị retry thành acceptancePASS.

Đầu ra: Browser runner/config; Login/list/deny smoke; Screenshot/trace/report desktop/mobile.

Acceptance: Không route.fulfill/mock HTTP trong smoke REAL_API; login bằng fixture thật.; Nối legacy endpoints đang chạy; target /api/v1 chưa có không được giả là đã implement.; Màn danh sách không rỗng do stub; cùng warehouse scope từ API..

### W01-QA-01 — Hoàn thiện test plan, fixture/run protocol và ma trận W01

Ownership: Hồ sơ/test matrix/evidence của W01; seed design với BE, không sửa code sản phẩm thay developer.

- [ ] **W01-QA-01-M01** — Đối chiếu test basis R2 với scope W01. Đầu ra: Scope/case decision log. Đạt khi: Không test foundation W02 như đã có; không sửa expected theo code sai.
- [ ] **W01-QA-01-M02** — Đóng case IDs, input/expected và dataset. Đầu ra: test-matrix W01-TC01..12. Đạt khi: Có anon/deny/scope/isolation/cleanup/negative; không chỉ happy path.
- [ ] **W01-QA-01-M03** — Thiết kế seed/reset/test clock và ownership. Đầu ra: Fixture manifest/version. Đạt khi: Không ghi credential vào hồ sơ công khai; không sửa.env.
- [ ] **W01-QA-01-M04** — Lập run manifest, defect và evidence templates. Đầu ra: Templates dùng ngay. Đạt khi: SHA+dirtydiff, Node24, command/exit, DBtarget, case, actual và hash.
- [ ] **W01-QA-01-M05** — Bàn giao test plan cho BE/FE và lịch run nguồn lực. Đầu ra: Test plan được điều phối chốt. Đạt khi: QA design có thể song song; QA thực thi chờ BE/FE outputs.

Đầu ra: W01 test plan/design/procedure; Fixture/RBAC matrix; Execution/defect/summary templates.

Acceptance: Mỗi case có setup/input/expected/actual/status/evidence level, requirement và task links.; Tám actor/ba kho từ R2; ít nhất Admin, Manager, Supervisor và user thiếu authority cho smoke.; Phân biệt E02b bootstrap/basic RBAC với security/refresh/idle/RBAC đầy đủ ở W02..

### W01-QA-02 — Chạy full gate/API/browser thật, retest và đóng E02b/W01

Ownership: Evidence/test summary/defect và cập nhật tracker; không tự sửa source khi QA thấy lỗi.

- [ ] **W01-QA-02-M01** — Xác minh target handle/grant, config/credential protection và exact diff. Đầu ra: Run preflight record. Đạt khi: Không đọc.env/DB hiện hữu; probe cũ không chứng minh hiện đang sẵn sàng.
- [ ] **W01-QA-02-M02** — Chạy unit/typecheck/full UI check cùng baseline cuối. Đầu ra: Gate logs. Đạt khi: Không còn failure compile/test chưa xử lý; không no-tests-found.
- [ ] **W01-QA-02-M03** — Chạy API/DB migration-seed-reset-login-deny-scope/rollback/race helper. Đầu ra: W01-TC01..08/12 actuals. Đạt khi: Ghi rõ basic RBAC test nào, không suy rộng refresh/idle/W02 PASS.
- [ ] **W01-QA-02-M04** — Chạy browser1440/390 với API thật và fixture thường. Đầu ra: W01-TC09..11 actuals. Đạt khi: Trace/screenshot/console sạch lỗi chặn; không network stubs.
- [ ] **W01-QA-02-M05** — Triage defect, trả BE/FE sửa trong ownership rồi retest. Đầu ra: Defect/retest log. Đạt khi: Không QA tự đổi expected; defect vượt range effort phải coordinator reforecast.
- [ ] **W01-QA-02-M06** — Thu code review độc lập, owner acceptance và test completion report. Đầu ra: Review đúng diff + approval thật. Đạt khi: Không tự ký reviewerPASS; BE/FE peer-review có thể dùng trong đội1:1:1.
- [ ] **W01-QA-02-M07** — Cập nhật E02b và task/package tracker sau evidence. Đầu ra: Gate registry + W01 acceptance. Đạt khi: Issue closed không tự đổi package accepted; kiểm evidence trước mỗi cập nhật.

Đầu ra: Execution records + defects/retest; E02b evidence; Test completion report + owner acceptance.

Acceptance: Chạy đúng reviewed SHA/diff, mọi case bắt buộc PASS không có defect chặn chưa giải quyết.; Đủ API/DB/Redis/browser thật và run isolation; unit/schema/probe không thay bằng chứng này.; Code review độc lập với người viết và owner acceptance có thật; chưa đủ giữ NOT_RUN/BLOCKED.; Chỉ mở W02 implement khi W01-QA.T COMPLETE và E02b VERIFIED; báo cáo phase local, không production ready..

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

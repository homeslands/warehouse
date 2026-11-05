# Warehouse - tài liệu thiết kế và kế hoạch W00–W11

**PUB-R1 · 05/11/2026 · bộ tài liệu dùng chung cho team.**

Bắt đầu ở [TEAM-HANDOFF](TEAM-HANDOFF.md): phân công BE/FE/QA/PM, issue nhận việc, cách track và giới hạn bằng chứng. Tài liệu này là bản đọc trên Git của hồ sơ đã duyệt; scope/contract vẫn theo WH-DEC-20261105-R2.

| Cần đọc | Tài liệu |
|---|---|
| Roadmap toàn dự án | [HTML](roadmap/warehouse-roadmap.html) · [PDF](roadmap/warehouse-roadmap.pdf) · [BE](roadmap/plan-be.md) · [FE](roadmap/plan-fe.md) · [Tester](roadmap/plan-tester.md) |
| Phân rã W00–W11 | [Dossier index](baseline/dossiers/index.json) · [W00](baseline/dossiers/W00.md) · [W01](baseline/dossiers/W01.md) · [W02](baseline/dossiers/W02.md) |
| Kế hoạch nguồn lực1:1:1 | [Plan](baseline/planning/implementation-plan.md) · [Schedule CSV](baseline/planning/resource-schedule.csv) · [Estimate breakdown](baseline/planning/estimate-breakdown.csv) |
| Quyết định và gate R2 | [37quyết định](baseline/approvals/r2/decision-pack.json) · [Gate registry](baseline/gates.json) · [Readiness HTML](baseline/report/implementation-readiness.html) · [PDF](baseline/report/implementation-readiness.pdf) |
| Plan riêng W00 | [Markdown](execution/w00-w01/W00-plan.md) · [HTML](execution/w00-w01/report/W00-plan.html) · [PDF](execution/w00-w01/report/W00-plan.pdf) |
| Plan riêng W01 | [Markdown](execution/w00-w01/W01-plan.md) · [HTML](execution/w00-w01/report/W01-plan.html) · [PDF](execution/w00-w01/report/W01-plan.pdf) |
| Task/microtask và nghiệm thu | [Tasks](execution/w00-w01/task-register.csv) · [Microtasks](execution/w00-w01/microtask-register.csv) · [12case W01](execution/w00-w01/test-matrix.csv) · [Execution protocol](execution/w00-w01/execution-procedure.md) |
| API/data/quyền/UI | [Contracts](baseline/contracts/architecture-and-boundaries.md) · [OpenAPI](baseline/contracts/openapi-v1.json) · [gRPC](baseline/contracts/warehouse-storage.proto) · [Data](baseline/contracts/data-and-migration.md) · [Quyền](baseline/contracts/permission-policy.csv) · [UI](baseline/contracts/screen-contracts.md) |
| Test basis R2 | [Cases](baseline/qa/test-cases.json) · [Fixture](baseline/qa/fixture-plan.json) · [Requirements↔case](baseline/qa/requirement-case-links.csv) |
| Nhãn và phân công | [Team](TEAM-HANDOFF.md) · [Issue snapshot](tracking/issue-snapshot.json) · [Taxonomy draft](tracking/label-proposal/policy.md) |

## Pull về và đọc

```bash
git fetch origin
git switch --track origin/docs/share-wxx-plans-20261105
```

Dùng một checkout/worktree sạch nếu đang có WIP. Sau khi PR tài liệu được merge, `git pull --ff-only` trên main sẽ nhận bộ docs này. Markdown đọc trực tiếp trên GitHub; HTML mở từ file sau khi pull; PDF tải hoặc xem trên GitHub.

## Phiên bản và giới hạn

- D03 giữ kiến trúc đích Gateway/gRPC/Storage; D06 private file; D14 bảo mật/backup/retention; POS thật và SMS phase sau. Chưa có test/deploy/acceptance mới trong việc phát hành docs.
- Cửa sổ W01 chi tiết R1 là8–14ngày làm việc; forecast toàn dự án R2 vẫn239–419ngày chờ rolling reforecast, không phải deadline cam kết.
- Reports/CSV lịch sử không tự cập nhật từ GitHub. Đọc ngày/revision và TEAM-HANDOFF trước khi dùng trạng thái cũ.
- Các nguồn raw design, log/runtime private, agent setup và secret không nằm trong gói; [source references](references/SOURCE-REFERENCES.md) ghi rõ các link provenance không phát hành. Chỉ đọc tài liệu không cấp quyền chạy DB/deploy.
- Cấu trúc hồ sơ có document control, traceability, ownership, gate, acceptance/evidence, risk/change control theo tailoring ISO đã nêu trong baseline. Không tuyên bố chứng nhận hoặc tuân thủ đầy đủ từng clause.

# Team handoff và trạng thái khi phát hành PUB-R1

**05/11/2026 · Asia/Bangkok (UTC+7) · phân công theo chỉ định trực tiếp của người dùng.**

| Người | GitHub | Vai trò |
|---|---|---|
|LAN ANH|[@lananh138](https://github.com/lananh138)|QA/QC/Tester|
|THẮNG|[@quyetthangdev](https://github.com/quyetthangdev)|Frontend|
|Mekong|[@Mekong-HCM](https://github.com/Mekong-HCM)|Backend, PM và tài liệu|

## Nhận việc từ đâu

- **BE / Mekong:** [W01-BE-01 #161](https://github.com/homeslands/warehouse/issues/161), sau đó [harness #162](https://github.com/homeslands/warehouse/issues/162); đọc [architecture](baseline/contracts/architecture-and-boundaries.md), [data/migration](baseline/contracts/data-and-migration.md), [OpenAPI target](baseline/contracts/openapi-v1.json), [gRPC target](baseline/contracts/warehouse-storage.proto).
- **FE / THẮNG:** [W01-FE-01 #163](https://github.com/homeslands/warehouse/issues/163), [browser smoke #164](https://github.com/homeslands/warehouse/issues/164); đọc [screen contracts](baseline/contracts/screen-contracts.md), [screen catalog](baseline/contracts/screen-catalog.csv) và [tokens](baseline/contracts/design-tokens.json).
- **QA / LAN ANH:** [W01-QA-01 #165](https://github.com/homeslands/warehouse/issues/165), [full gate #166](https://github.com/homeslands/warehouse/issues/166); đọc [test matrix W01](execution/w00-w01/test-matrix.csv), [464 case thiết kế R2](baseline/qa/test-cases.json), [fixture plan](baseline/qa/fixture-plan.json), [run/defect/completion templates](execution/w00-w01/evidence-templates.md).
- **PM/doc / Mekong:** issue tổng [W00 #156](https://github.com/homeslands/warehouse/issues/156), [W01 #157](https://github.com/homeslands/warehouse/issues/157); [WBS W00–W11](baseline/dossiers/index.json), [lịch nguồn lực](baseline/planning/resource-schedule.csv), [tracking procedure](execution/w00-w01/tracking-procedure.md). #159/#160 đồng giao Mekong phụ trách doc và FE/QA phụ trách chuyên môn.

## Cách hiểu đúng trạng thái

Các kế hoạch/báo cáo baseline R2/W00-W01-R1 giữ số liệu tại ngày/revision lập; câu như “chưa có assignee” hoặc “chưa commit/push trong task” mô tả task cũ. Phân công ở trên đã cập nhật sau đó. [Issue snapshot](tracking/issue-snapshot.json) là bản chụp lúc publish; **GitHub issue/PR là trạng thái hiện hành**, không có đồng bộ tự động với các CSV/JSON được commit.

Không lấy PR merged, image published, issue closed hoặc tên người đã assign làm bằng chứng test/deploy/receipt/acceptance. Chạy lại theo [execution procedure](execution/w00-w01/execution-procedure.md) trên SHA/diff/target được cấp. W02 implement chỉ mở sau W01-QA.T vàE02b verified; W01 local không tự bị thêm nghĩa vụ deploy sandbox/Mekong. Kiến trúc R2 là đích, chưa phải toàn bộ API/UI đã hiện thực.

## Cập nhật tiến độ có thể pull/review

1. Người nhận đọc baseline/issue; ghi người phụ trách, actual_start chỉ khi bắt đầu thật và source SHA/target. Assignment không phải chữ ký nhận hồ sơ.
2. Cập nhật checklist/evidence trong GitHub issue; task/microtask trong bản progress-state của nhánh tài liệu làm việc, ghi timestamp, người cập nhật, expected/actual và artifact/commit tương ứng. Đầu/cuối ngày làm việc điều phối đối soát hai nơi.
3. Thay đổi docs/CSV/JSON dùng nhánh + PR, không ghi đè hash baseline để coi như chưa đổi nội dung. Thay đổi requirement/contract phải revision/CR theo nguồn R2. Không đưa credential/private test config/raw log chứa dữ liệu thật vào docs.
4. `COMPLETE` task, `CLOSED` issue và `ACCEPTED` gói là ba khái niệm khác nhau; QA/review/owner phải đúng DoD của issue. Đề xuất [taxonomy](tracking/label-proposal/policy.md) vẫn DRAFT, chưa được áp lên repo trong đợt publish này.

## Môi trường và dữ liệu

Grant test WH-TEST-ENV-20261105 mô tả target local đã cấp cho workspace ban đầu; không phải quyền truy cập hoặc dịch vụ có sẵn trên máy teammate. Liên hệ Mekong để cấp target/credential qua kênh riêng, hoặc tạo môi trường test cách ly theo task được cho phép. Không dùng .env/DB người dùng và không chạy migration bằng cấu hình mặc định. Fixture actor/password fields là thiết kế/placeholder, không phải tài khoản thật. Không có secret được phát hành trong gói.

## Nguồn và tính toàn vẹn

[PUBLICATION-MANIFEST](PUBLICATION-MANIFEST.json) ánh xạ source SHA256 → published SHA256. JSON/CSV/proto/SVG giữ byte gốc, trừ gap-register.csv audit chỉ bổ sung header evidence_view_key bị thiếu (giữ nguyên20dòng dữ liệu); Markdown/HTML chỉ điều chỉnh link, thêm note và vô hiệu khối lệnh tooling local không phát hành. PDF dựng lại từ HTML bản đọc với link HTTPS tới nhánh Git. Không đổi business rules/contract hoặc giả approval sản phẩm. Baseline hashes ở source-register/readiness-evidence là hash **nguồn gốc**, không phải checksum của file đọc đã chuyển link.

## Cập nhật sau PUB-R1

- **[PU-20261105-01](execution/w00-w01/progress-updates/PU-20261105-01.md)** (05/11/2026, Mekong-HCM)
  - W01-BE #161/#162 đã merge (PR #190/#191) và đã xác minh sau merge. Hiện READY_FOR_QA, **chưa ACCEPTED**.
  - FE/QA dùng harness `app/warehouse-api/test/README-e2e.md` (`npm run test:e2e:serve`).
  - Receipt W00-FE/QA vẫn đang chờ.
  - Bản cập nhật này làm `progress-state.json` và file này khác hash trong PUBLICATION-MANIFEST (manifest chỉ mô tả snapshot PUB-R1).

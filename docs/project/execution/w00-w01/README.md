> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# W00–W01 — kế hoạch và issue đã phát hành

**WH-PLAN-W00-W01-20261105-R1 · APPROVED theo quyền điều phối05/11/2026.**

- [Trang điều phối](report/index.html).
- W00: [HTML](report/W00-plan.html), [PDF](report/W00-plan.pdf), [Markdown](W00-plan.md), [issue tổng#156](https://github.com/homeslands/warehouse/issues/156).
- W01: [HTML](report/W01-plan.html), [PDF](report/W01-plan.pdf), [Markdown](W01-plan.md), [issue tổng#157](https://github.com/homeslands/warehouse/issues/157).
- [9task](task-register.csv), [49microtask](microtask-register.csv), [12case W01](test-matrix.csv), [progress state](progress-state.json).
- [Issue map](issue-map.json), [run/defect/completion templates](evidence-templates.md), [protocol thực thi](execution-procedure.md), [quy trình track](tracking-procedure.md).

Đã tạo11issue trên homeslands/warehouse, gồm2parent và9sub-issue thật: W00#156 có#158–160, W01#157 có#161–166. Đã readback body/hash và native parent links. GitHub connector thiếu quyền ghi (403); CLI tài khoản Mekong-HCM có quyền và được dùng để thực hiện yêu cầu. Không commit/push hoặc sửa quyền repo.

## Bước thực hiện

Ba task có thể nhận trước: BE#161, FE#163, Tester#165. API harness#162 chờ BE#161; browser#164 chờ FE#163 và API#162; QA/acceptance#166 chờ test design/API/browser. W01 chi tiết8–14ngày làm việc từ T0 chưa chốt; cùng effort BE4–7/FE4–7/QA5–8. R2 tổng quát7–12 được refinement do phụ thuộc browser thật; forecast tổng dự án sẽ rolling reforecast sau W01.

W00 có12/15microtask checklist hồ sơ/phát hành đã có evidence, còn3receipt nhân sự pending; đây không phải phần trăm code. W01 có0/34microtask triển khai hoàn thành, case đều NOT_RUN. Không tự gán assignee/tên người/actual_start hoặc mở W02 từ việc tạo issue.

## Kiểm soát hồ sơ

Mỗi plan có ID/revision/date/approval, scope, nguồn/hash, phase entry/exit, WBS/ownership/dependencies, tiến độ/Gantt, risk/change log và acceptance evidence. Cấu trúc tailoring theo ISO/IEC/IEEE15289:2019,29148:2018,29119-3:2021 và ISO21502:2020; xem iso-tailoring.json và URL chính thức trong báo cáo. Không tự nhận chứng nhận hoặc tuân thủ đầy đủ mọi clause.

Khi cập nhật tiến độ: ghi người thật/actuals/evidence, đồng bộ checklist thủ công theo tracking-procedure.md; issue state khác task COMPLETE và package ACCEPTED. Source design R2 giữ nguyên hash. Task này không sửa app/WIP; hai test upload đã khác snapshot WIP cũ của R2, xem evidence/exit-source-drift.json. Source từ lúc bắt đầu task lập issue đến lần kiểm tra cuối không đổi. Không CI/CD, scheduler, `.env`, DB hiện hữu hoặc app test trong task lập hồ sơ/issue.

Gói handoff ở handoff/warehouse-W00-W01-R1.zip chứa hồ sơ được allowlist và manifest; không credential/private/runtime/app source. Gói local này chưa được upload lên repo. Các nguồn ngoài gói được ghi rõ trong manifest.

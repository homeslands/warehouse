> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# Warehouse — đã chốt hồ sơ trước implement R2

**37/37 quyết định APPROVED theo ủy quyền điều phối. Bước tiếp theo: W01.**

- [Báo cáo HTML](report/implementation-readiness.html), [PDF](report/implementation-readiness.pdf): gate, việc tiếp theo, kế hoạch tách BE/FE/Tester, tiến độ, sơ đồ và wireframe.
- [Quyết định R2](approvals/r2/decision-pack.json), [gate registry](gates.json), [protocol sau code](execution-gates.md).
- [Dossier W01](dossiers/W01.md), [dossier W02](dossiers/W02.md); toàn bộ W00–W11 trong dossiers/.
- [Kế hoạch 1:1:1](planning/implementation-plan.md): 239–419 ngày làm việc, chưa có T0/deadline cam kết; thay estimate cũ 149–270 ngày.
- [Đối soát worker upload](carryover-alignment.md): không giao trùng ownership, migration047 giữ cho task đang làm.
- [Grant target test](environment/HANDOFF.md): MySQL/Redis riêng đã qua probe; chưa migrate/seed/start ứng dụng.

POS là hệ khác sẽ làm sau. SMS hoãn khỏi phase hiện tại theo ý kiến người dùng và quyết định điều phối. Yêu cầu gốc giữ ở FUT-POS/FUT-SMS, chưa nghiệm thu đầy đủ tích hợp thật.

## Cách thực hiện và track

1. BE01/FE01/QA01 nhận task W01 và ghi actual_start bằng tracker. Đây là vị trí của đội, chưa giả tên hoặc chữ ký nhân sự.
2. BE sửa gate/harness; FE sửa full check/browser smoke; Tester bootstrap fixture và chạy gate trên API/DB thật. Worker upload tiếp tục phần đang sở hữu.
3. Chỉ đóng E02b khi có migration/seed/login/RBAC thật trên target test, lưu exact command, SHA/diff, log và kết quả.
4. W02 implement chờ W01-QA.T COMPLETE + E02b VERIFIED; các task sau chờ dependencies riêng. Mỗi task có evidence; package acceptance có QA, code review độc lập và owner thật.

> **Tooling local của nguồn:** khối lệnh này không phát hành trong repo. Team dùng quy trình tracking ở [TEAM-HANDOFF](../TEAM-HANDOFF.md); target/credential được cấp riêng.


Khi có evidence E02b, người chịu trách nhiệm dùng `tracker.py gate E02b --actor ... --evidence ...`; lệnh ghi evidence/hash, không tự xác minh nội dung test. Không dùng để đổi gate deferred thành PASS. Evidence task bị mất/sai: dùng `invalidate-task` kèm reason, tracker hạ trạng thái và buộc làm lại; không ghi đè hash cũ để lách.

## Baseline và giới hạn bằng chứng

- `readiness-evidence.json` khóa hash các hồ sơ được duyệt. Không chỉnh trực tiếp hồ sơ đã khóa; thay đổi thiết kế phải có revision/CR và đánh giá tác động.
- Chỉ rebuild báo cáo hiện hành bằng `build_roadmap.py`. Các generator contract/plan/policy là nguồn tạo baseline, chỉ dùng để lập revision mới; không rerun tùy ý lên hồ sơ đang được hash.
- `history-r1/` lưu state/report/builder trước R2; R1 approvals giữ nguyên ở roadmap cũ.
- `verification/design-validation*.json`: kiểm cấu trúc thiết kế; `tracker-validation.json`: kiểm hành vi tracker bằng state tạm. Cả hai không phải QA ứng dụng.
- 464 case là DESIGNED_NOT_RUN; 339 field occurrences là disposition thiết kế; 230 dòng là tập requirements đang quản lý. Không coi các số này là chứng minh đầy đủ mọi nhánh đã PASS.
- Private credentials không nằm trong public evidence/manifest; không gửi thư mục private hoặc tooling-venv làm gói bàn giao.
- Chưa sửa app source, chạy migration ứng dụng, gửi email/SMS thật, CI/CD, deploy, commit hoặc push trong task này.

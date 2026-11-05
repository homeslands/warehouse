> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# WH-PRO-W00-W01-20261105-R1 — Track và kiểm soát thay đổi

Điều phối phê duyệt05/11/2026, đội1:1:1. Thực hiện thủ công; không có scheduler, CI/CD hoặc tự đồng bộ GitHub.

1. **Nhận việc:** đọc plan/microtask/source hash; ghi assignee thật, SHA+dirtydiff, actual_start. W00 receipt chưa có người ký giữ pending, không reset hồ sơ R2 đã hoàn thành.
2. **Thực hiện:** cập nhật task/microtask và effort còn lại trong progress-state.json, kèm evidence. Đầu/cuối ngày làm việc ghi checkpoint; ngày dự kiến không phải actual.
3. **Bàn giao QA:** microtask được check khi có output/acceptance evidence. Giữ GitHub checklist cùng source version. Issue tạo/open/closed không tự đổi trạng thái code hoặc package acceptance.
4. **Ánh xạ tracker cũ:** cả W01-BE-01/02 hoàn thành mới đề nghị W01-BE.I COMPLETE; cả W01-FE-01/02 mới W01-FE COMPLETE; QA-01 ánh xạ QA.D; QA-02 ánh xạ QA.T. Không đánh dấu parent stage hoàn thành khi mới xong một subtask.
5. **Đóng gate:** API/DB/browser thật, run/retest logs, code review độc lập và owner acceptance có thật. E02b chỉ VERIFIED sau bootstrap/basic RBAC run; security đích đầy đủ còn W02. Sau W01-QA.T COMPLETE + E02b VERIFIED mới mở W02 implement.
6. **Chặn:** BLOCKED cần owner/impact/unlock/evidence. Không giữ task tự tiến theo ngày hoặc che blocker bằng phần trăm.
7. **Thay đổi:** sửa scope/contract R2 phải CR/revision và phê duyệt điều phối; không sửa file đã khóa hash. Thay effort/capacity phải reforecast. R1 chi tiết hóa W01 thành8–14ngày vì browser chờ harness thật, cùng effort BE4–7/FE4–7/QA5–8. Cửa sổ tổng quát R2 là7–12; forecast toàn dự án rolling reforecast sau W01, không âm thầm đổi bản đã duyệt.
8. **Hồ sơ công khai:** issue có mục tiêu/ownership/microtask/acceptance/ID/hash. Đường dẫn .agents là local-only; điều phối cấp gói tài liệu kiểm soát và target grant riêng, không đăng secret/private config trên GitHub. Không commit/push .agents hoặc AGENTS.md.

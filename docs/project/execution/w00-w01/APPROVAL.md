> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# WH-APR-W00-W01-20261105-R1 — Phê duyệt điều phối

Ngày05/11/2026, Asia/Ho_Chi_Minh. Người phê duyệt: **Codex — điều phối theo ủy quyền trực tiếp của người dùng**.

Ủy quyền: người dùng yêu cầu bắt đầu tạo kế hoạch/issue riêng W00–W01, có bảng/sơ đồ tiến độ, phase/task/microtask từ tài liệu đến implement và tạo issue tương ứng trên repo; sau đó yêu cầu tài liệu theo cấu trúc ISO và dùng quyền điều phối.

Phê duyệt2plan R1 và phân rã9task/49microtask; đội1BE:1FE:1Tester;11issue trên homeslands/warehouse. Cửa sổ W01 chi tiết8–14ngày do browser smoke chờ API harness thật, cùng effort với R2; chưa chốt ngày lịch/actual_start. Không thay thiết kế WH-DEC-20261105-R2.

Phê duyệt cấu trúc hồ sơ, phạm vi, ownership, thứ tự, evidence và publication. Không có review độc lập mới trong task này; không giả chữ ký người dùng hoặc reviewerPASS. W00 hồ sơ/phát hành có evidence, receipt nhân sự chưa có. W01 code/test chưa thực hiện và chưa nghiệm thu sản phẩm. GitHub issues đều giữ open; native parent links và body hashes đã được kiểm.

Khi bắt đầu code, người nhận chịu trách nhiệm xác minh SHA/diff/runtime/target và ghi actuals; chỉ ghi COMPLETE/VERIFIED khi có đúng mức bằng chứng. Giữ nguyên WIP upload và migration047. Không CI/CD, deploy, app source/migration execution, commit/push hoặc secret trong scope phát hành tài liệu.

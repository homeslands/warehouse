> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# Điều kiện thực thi và nghiệm thu sau thiết kế R2

Đã phê duyệt lựa chọn trước code. Các mục dưới đây là công việc kiểm chứng sau implement, không phải câu hỏi chờ chủ dự án quyết định.

| Gate | Owner | Thời điểm / điều kiện đóng | Phạm vi |
|---|---|---|---|
| E02b | BE01 + QA01 | W01 chạy migration/seed trên WH-TEST-ENV-20261105; lấy token bằng login thật; kiểm user Admin/Manager/Supervisor, kho chéo, helper reset/race; log exact SHA/diff | Harness và RBAC cơ bản; sau W02 phải kiểm lại auth/permission mới |
| E04-local | BE01 + QA01 | W11 chạy TLS/mTLS test hai service, NFR workload theo D16, restore DB+tệp trên target mới, đối soát checksum/ledger | Nghiệm thu phase local, không deploy hoặc gửi email thật |
| E04-operational | Owner môi trường vận hành + QA01 | Trước release production có target/grant riêng, TLS/cert/restore drill, uptime ≥99.5% trong 30 ngày, RPO24h/RTO4h | Chỉ full-project/release; DEV LOCAL chưa được cấp deploy |
| FUT-POS | Owner POS + BE01 + QA01 | Người dùng mở phase mới; cấp vendor/version/contract/sandbox; approve mapping rồi integration test thật | Không chặn core W06; chưa được công bố POS live |
| FUT-SMS | Owner nghiệp vụ + BE01 + QA01 | Chỉ mở lại bằng chỉ dẫn/CR mới về nhu cầu, provider, recipient và chi phí | Phase này không triển khai SMS; không xóa requirement gốc |

Khi test: ghi command, runtime Node24, SHA và dirty diff, target ID, fixture version, expected/actual, log/file hash, defect IDs. FAIL và NOT_RUN không đổi thành PASS từ quyết định điều phối. Independent code review/QA/owner acceptance của sản phẩm phải có hồ sơ thật; task hiện tại không thực hiện vòng review mới.

W01 là việc tiếp theo. BE sửa spec/harness; FE ổn định full check/browser smoke; Tester bootstrap fixture và chạy lại full gate. W02 BE.I chờ W01-QA.T COMPLETE có evidence và E02b VERIFIED. Mọi task sau vẫn chờ dependencies riêng; chốt thiết kế không cho phép bỏ gate test.

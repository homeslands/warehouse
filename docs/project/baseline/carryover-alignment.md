> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# Tiếp nhận công việc đang có — 05/11/2026

Điều phối xác nhận có worker đang triển khai file upload; không giao trùng các file đã ghi trong `entry-wip.json`. Task này chỉ sửa hồ sơ local và tracker. Source WIP không bị sửa hoặc revert.

| Nội dung | Quyết định điều phối | Bằng chứng cần trước khi nhận vào W02 |
|---|---|---|
| File upload legacy | Giữ hợp đồng response/error hiện có; yêu cầu đăng nhập và FILE_CREATE, seed quyền bằng migration | Lint/unit, migration và quyền thật trên DB test; Manager không mặc định có quyền |
| Giới hạn generic | Theo chỉ dẫn mới của người dùng trong task worker: 9 đuôi, kích thước **≤10 MiB**, kể cả đúng biên | Kiểm đúng biên và +1 byte; PDF/JPG/JPEG/PNG/WEBP/XLS/XLSX/DOC/DOCX |
| Chứng từ tài chính | D06/D30: ≤5 MiB, PDF/JPG/PNG; validate lại khi gắn phiếu | Generic upload thành công không có nghĩa được gắn phiếu tài chính |
| Nội dung tệp | MIME do client gửi chưa đủ; đuôi phải khớp nội dung nhận diện, chống tên nhiều dấu chấm và path traversal | Case file giả MIME, sai đuôi, nội dung không hợp lệ; S3 private và quyền đọc |
| Phân công | Worker hiện tại giữ file module, authority constants, migration047 và các spec của task đó | Người khác chỉ sửa sau handoff; đọc lại migration cuối trước khi reserve ID mới |
| Tiến độ | Có WIP và log unit trong task worker, chưa đủ nghiệm thu toàn W02 | Không tự ghi W02 COMPLETE hoặc trừ toàn effort khi chưa đối soát phạm vi |

Các log 40 file tests/228 regression trong handoff worker là mức unit/in-process, S3 được mock. Không dùng thay RBAC/DB/S3 thật hoặc private-file acceptance. Các snapshot lỗi API/UI ngày 04/11 vẫn là lịch sử, chưa phải kết quả chạy lại trên WIP hiện tại.

Bước tiếp theo: BE/FE/Tester thực hiện W01; worker upload tiếp tục phần đang sở hữu. Sau W01, tiếp nhận kết quả worker theo đúng contract D30 rồi thực hiện phần W02 còn thiếu. Không mở thêm task sửa các file upload song song.

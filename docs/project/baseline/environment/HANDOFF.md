> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# Môi trường test riêng được cấp — WH-TEST-ENV-20261105

Điều phối cấp target mới này cho W01 harness và các task QA local sau đó trong phạm vi dữ liệu test. Không dùng `.env` hoặc database hiện hữu. Cấp quyền thiết kế/migration vào target mới không đồng nghĩa migration ứng dụng đã chạy.

- MySQL: `wh-preimpl-20261105-mysql`, DB `warehouse_test_gates_20261105`, loopback port trong `target.json`.
- Redis: `wh-preimpl-20261105-redis`, loopback port và namespace trong `target.json`.
- Credential test sinh riêng ở thư mục `../private/`, quyền0600. Chỉ script cần kết nối đọc trực tiếp; không in, đưa vào report, copy sang `.env` hoặc đóng gói bàn giao.
- Container không có restart policy; MySQL dùng tmpfs, mất dữ liệu test khi xóa/recreate. Không có volume dữ liệu người dùng.
- Quyền setup đã thực thi: tạo target và probe table/key riêng, rollback/cleanup. **Chưa start app, chưa chạy migration/seed ứng dụng, chưa có user RBAC ứng dụng thật**.

Kiểm tra lại từ root workspace:

> **Tooling local của nguồn:** khối lệnh này không phát hành trong repo. Team dùng quy trình tracking ở [TEAM-HANDOFF](../../TEAM-HANDOFF.md); target/credential được cấp riêng.


W01: đọc grant này, dùng test config riêng (không ghi `.env`), chạy migration vào đúng DB mới, seed từ `../qa/fixture-plan.json`, lấy token qua login thật, rồi lưu log và checksum vào task W01. Các tài khoản JSON là thiết kế fixture cho đến khi bootstrap thành công. Khi tạo reset helper, phải allowlist database name và kiểm container label `warehouse.task=warehouse.preimplementation-gates-20261105` trước thao tác phá dữ liệu test.

Nếu container đã mất: `python3 .../prepare_test_environment.py` chỉ được tạo lại đúng target có label do task này sở hữu; đọc output và chạy probe lại. Nếu trùng tên nhưng sai label thì dừng, không xóa dịch vụ khác.

Khi không còn cần, chỉ dừng đúng hai container tên trên. Khi xóa target phải ghi lại trạng thái môi trường và cấp target mới trước QA; file probe cũ không chứng minh dịch vụ vẫn đang chạy. Không dùng lệnh dọn toàn bộ Docker.

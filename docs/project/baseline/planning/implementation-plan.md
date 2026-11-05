> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# Kế hoạch thực hiện R2 — đội 1 BE : 1 FE : 1 Tester

**APPROVED FOR PLANNING** · 05/11/2026 · Codex — Điều phối dự án, theo ủy quyền người dùng 05/11/2026

Hai kịch bản nguồn lực: **239–419 ngày làm việc từ T0**. Đây là estimate theo phân rã công việc, chưa phải ngày cam kết. Lịch cũ 149–270 ngày hết hiệu lực.

T0 là ngày làm việc đầu tiên có nhân sự nhận việc sau khi W00 đủ hồ sơ; người nhận ghi actual_start. Không tự đặt ngày bắt đầu đã xảy ra. Mỗi vai trò tối đa một task tại một thời điểm, 5 ngày/tuần; chưa trừ nghỉ lễ/phép.

W00 hoàn thành hồ sơ không có nghĩa W01 test đã xanh. Bắt đầu W01 trước; W02 implement chờ W01 full gate/harness. Contract và FE dùng mock có thể chuẩn bị theo dependencies, nhưng không được nghiệm thu như tích hợp thật.

| Gói | BE | FE | Tester |
|---|---:|---:|---:|
| W01 | 4–7 | 4–7 | 5–8 |
| W02 | 40–66 | 26–42 | 19–30 |
| W03 | 6–10 | 6–10 | 5–8 |
| W04 | 18–28 | 10–16 | 12–18 |
| W05 | 12–18 | 10–15 | 8–13 |
| W06 | 10–16 | 8–13 | 7–11 |
| W07 | 16–26 | 13–20 | 10–16 |
| W08 | 11–18 | 8–13 | 7–11 |
| W09 | 16–26 | 13–21 | 10–16 |
| W10 | 7–11 | 6–10 | 7–11 |
| W11 | 9–15 | 7–11 | 15–24 |

Các cột là effort cơ sở (ngày công). Task BE.F/FE.F/QA.R thêm dự phòng sửa lỗi và retest 10–20%; resource-schedule.csv đã gồm dự phòng. Không cộng ngày công của ba vai trò thành thời gian lịch.

## Theo dõi và tái ước lượng

- Không ghi code/test COMPLETE chỉ vì đã chốt quyết định. Có evidence, SHA/diff, môi trường và actuals mới cập nhật trạng thái.
- WIP file upload đang do worker khác làm: chưa nghiệm thu toàn W02 và chưa trừ estimate khi thiếu đối soát.
- Tái estimate sau W01/W02 bằng actuals. Thiếu người hoặc làm bán thời gian phải lập revision mới.
- POS thật và SMS nằm phase sau; không tính trong forecast phase này. TLS/vận hành/uptime thực vẫn có protocol và gate riêng.

Chi tiết: estimate-breakdown.csv; plan.json; resource-schedule.csv; schedule-validation.json.

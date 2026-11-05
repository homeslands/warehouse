> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# WH-FOR-W01-20261105-R1 — Mẫu bằng chứng

Phê duyệt dùng trong W01 bởi điều phối05/11/2026. Đây là mẫu, không phải record đã chạy.

## Run record

| Trường | Giá trị người chạy phải ghi |
|---|---|
| run_id / started_at / finished_at | ID và thời điểm thực tế Asia/Ho_Chi_Minh |
| actor / role / issue / case | Tên người thật, role và các ID liên quan |
| source | HEAD, branch, dirty diff SHA256, migration list |
| runtime | Node24 version, OS, test worker settings |
| environment | Test target ID/handle đã được cấp, fixture version; không password/token |
| command / exit | Lệnh chính xác và exit từng bước; không chỉ wrapper exit0 |
| expected / actual / result | PASS / FAIL / NOT_RUN và quan sát thực tế |
| evidence | Log/report/screenshot/trace, SHA256 và thời điểm |
| limitation / defect / retest | Mức bằng chứng, defect ID, owner và run retest |

## Defect record

ID; nguồn requirement/case; trigger/repro/input; expected/actual; severity; source/target; evidence; owner; phạm vi sửa; trạng thái; verified SHA/diff; retest run. Không đổi expected theo code đang sai. Nếu vượt scope, điều phối chốt issue/CR bổ sung, giữ gate chưa đạt.

## Handoff và completion record

Task/issue; người thực hiện; paths sở hữu; source/diff; acceptance từng mục; commands/results; review độc lập đúng diff; findings còn mở; defects/retest; QA conclusion; owner acceptance; gate/tracker update; phần NOT_RUN. Người viết không tự nhận reviewer PASS. Không có chữ ký thực thì giữ PENDING.

> Bản chia sẻ PUB-R1 · 05/11/2026. Nội dung kế hoạch/baseline là snapshot theo revision gốc; xem [TEAM-HANDOFF](../../TEAM-HANDOFF.md) để biết phân công mới. Link đã chuyển cho repo; SHA nguồn và SHA bản xuất ở PUBLICATION-MANIFEST.json. Phát hành Git không tự đóng gate/code/test.

# WH-ISSUE-TAXONOMY-20261105-R1.1 - Phân loại và theo dõi issue

**DRAFT_FOR_REVIEW · 05/11/2026 · Asia/Bangkok (UTC+7)**

Người lập: Codex điều phối. Phạm vi: bổ sung và review giải pháp nhãn/metadata cho repository homeslands/warehouse. Chưa tạo/sửa nhãn, milestone, assignee, Projects hay trạng thái issue trên GitHub. Không đổi scope hoặc nguồn thiết kế R2/W00-W01-R1.

## 1. Rà lại hiện trạng

Snapshot21issue:11issue W00/W01 #156–166 chưa có label;10issue khác có bug/enhancement nhưng chưa đủ phân loại. Cả21issue chưa có assignee/milestone trong snapshot. Repo hiện có9label chuẩn GitHub. Thiếu không chỉ nhãn mà còn ownership người nhận, milestone, dependency và evidence sau merge.

Các thiếu sót của đề xuất trước: chưa có priority/severity/area/risk/target; type quá thô; chưa phân biệt nhãn chờ với trạng thái; chưa quy định điều kiện gỡ gate, xử lý legacy label, PR liên quan và nguồn bằng chứng. Không suy từ CLOSED hoặc PR merged rằng QA/deploy đã đạt.

## 2. Bộ nhãn đầy đủ, tạo theo nhu cầu

Danh mục43nhãn đề xuất;28nhãn xuất hiện trong mapping hiện tại, còn lại chỉ tạo khi có issue cần. Không tạo W02–W11 trước khi phân rã/giao các gói đó.


|Nhóm|Ví dụ / tập giá trị|Quy tắc|
|---|---|---|
|WBS|wbs:W00 / wbs:W01|Một gói chính đã đối chiếu plan. Task liên gói dùng linked issue; không đoán WBS từ BE/QA hoặc PR.|
|Vai trò|role:BE / FE / QA / COORD|Một vai trò chịu trách nhiệm chính. Assignee là người thật; role không thay assignee.|
|Loại|type:epic / feature / bug / refactor / test / docs / chore|Một loại chính. Parent package=epic; test design/harness/regression=test.|
|Ưu tiên|priority:P0 / P1 / P2 / P3|Một mức đã triage; P0 có sự cố/evidence, P1 gate đường găng, P2 kế hoạch thường, P3 có thể hoãn.|
|Mức độ lỗi|sev:S1 / S2 / S3 / S4|Chỉ type:bug; mô tả impact thực tế, không lấy độ gấp thay severity. Thiếu căn cứ để pending.|
|Phạm vi|area:api / ui / auth / database / storage / quality / delivery / docs|Thường1–2area thực sự có acceptance; không gắn mọi module có thể bị ảnh hưởng.|
|Rủi ro|risk:security / data / breaking-change|Tùy chọn theo impact; không phải xác nhận lỗ hổng hoặc test đã PASS.|
|Target cần kiểm|target:local / sandbox / mekong|Là môi trường dự định nghiệm thu; không chứng minh đã deploy/test. Không suy sandbox=Mekong.|
|Gate|gate:needs-spec / needs-review / needs-test-env / needs-qa / needs-deploy / needs-handoff|Chỉ dùng khi đang có phần còn thiếu thật; cần owner/impact/evidence/unlock.|
|Điều khiển|blocked / meta:needs-triage|blocked là không thể tiếp tục scope; meta:needs-triage chỉ thiếu phân loại, không reopen code.|



Nhãn thường5–8/issue, tăng khi có risk/gate thật; không gắn cả danh mục. Giữ duy nhất một nhãn wbs/role/type/priority/severity trong mỗi nhóm (target có thể nhiều nếu acceptance yêu cầu). Ngoại lệ thiếu wbs/priority/severity được đánh dấu meta:needs-triage với owner xử lý; không giả định P2 hoặc S3 cho mọi bug.

## 3. Priority và severity là hai quyết định khác nhau

P0: active incident có evidence, người điều phối ưu tiên xử lý ngay. P1: chặn milestone/gate gần nhất. P2: công việc đã lập kế hoạch nhưng chưa thuộc P0/P1. P3: cải tiến hoãn được, không bỏ yêu cầu bắt buộc của thiết kế.

S1: impact nghiêm trọng lên dữ liệu/bảo mật/vận hành; S2: chức năng chính sai/không dùng được, không có workaround khả thi; S3: impact giới hạn hoặc có workaround; S4: trình bày nhỏ. QA xác minh impact, điều phối chốt priority; không tự suy severity từ từ khóa security hoặc tên issue.

Mapping W01 đề xuất P1 vì là gate mở W02. W00 đề xuất P2 khi chỉ còn bàn giao; nếu receipt thực tế đang chặn team, nâng P1 kèm lý do. Priority này là đề xuất cần đối chiếu khi nhận việc, không thay ngày cam kết hay status.

## 4. Trạng thái, milestone và người nhận việc

- Status duy nhất trên Projects: Triage → Ready → In progress → Review → QA → Done; Blocked là trạng thái tạm kèm blockers. Không tạo thêm bộ label status:* để phải đồng bộ hai nơi.
- Nếu chưa có Projects/quyền: ghi cùng trường Status trong issue body theo dõi thủ công; label blocked/gate là bộ lọc, không tạo board giả. Khi có board thì chuyển nguồn status sang board, không để hai nguồn song song.
- MilestoneW00/W01 phục vụ rollup; wbs label phục vụ filter. Chỉ map #156/#158–160 vàoW00, #157/#161–166 vàoW01 từ plan đã duyệt. #167–174/#179/#180 chờ điều phối map nguồn/CR; không tự gán W01 vì gần thời điểm.
- Assignee là người đã nhận scope. BE01/FE01/QA01 chỉ là vị trí. Cả21issue hiện chưa có assignee nên không được báo đã giao người chỉ bằng role label.
- Parent epic có native sub-issue links; dependencies dùng liên kết blocked-by/blocking nếu API/UI hỗ trợ, nếu không có bảng depends-on trong body. Không tạo chu trình; ghi direct dependency, tránh ghi transitive trùng như điều kiện độc lập.
- %milestone/closed count chỉ là tỷ lệ issue closed, không phải %code/effort hoặc nghiệm thu toàn gói. Done theo DoD riêng của issue; epicDone cần child acceptance + gate/owner thật.

### Crosswalk với tracker W00/W01 hiện có

Projects/body Status là vòng đời xử lý issue; progress-state.json là trạng thái task/microtask và evidence delivery theo tracking-procedure đã duyệt. Hai khái niệm không thay lẫn nhau. Issue owner cập nhật workflow khi bàn giao; BE/FE/QA ghi actual/evidence vào tracker tương ứng; điều phối đối soát hai nơi tại checkpoint đầu/cuối ngày và trước đổi gate/milestone.

- NOT_STARTED ở tracker không tự chứng minh Ready; chỉ Ready khi dependency/quyền/source đã readback, nếu chưa thì Triage.
- DOCUMENTATION_COMPLETE_RECEIPT_PENDING giữ nguyên docs COMPLETE; workflow có thể Review/Handoff pending, không reset về thiết kế chưa làm.
- IN_PROGRESS phải có người nhận/actual_start; READY_FOR_REVIEW/READY_FOR_QA chỉ có sau artifact/run manifest tương ứng, không đổi giá trị tracker âm thầm nếu enum hiện hữu khác.
- Task COMPLETE không tự thành package ACCEPTED. Done chỉ khi DoD chính issue đủ; milestone/epic acceptance cần owner/gate riêng. QA/deploy tách issue thì liên kết rõ, không buộc mọi issue docs/code phải đợi deploy.
- Nếu lệch workflow/tracker/issueClosed: ghi reconciliation record với issue/task, before/after, evidence SHA, người chốt và thời điểm. Giữ nguyên tiến độ chưa được kiểm chứng; không dùng label thay nguồn evidence. Status field/body fallback đều là đề xuất, chưa được triển khai.

## 5. Gate có điều kiện mở và điều kiện bỏ

Ba gate receipt W00 đã có record dự thảo trong gate-register.json, liên kết microtaskM05 đúng plan. Owner/receiver thật chưa có nên mapping ghi unresolved và gate_application=HOLD; chỉ được áp label gate sau khi preflight bổ sung owner thật và readback receipt, không áp từ row nhãn đơn thuần. set_at/cleared_at=null vì chưa áp/gỡ.

Mỗi gate có record: gate_id, missing_item, owner, blocker_issue/artifact, impact, target, evidence, unlock_condition, set_at, cleared_at. Có gate chờ không mặc nhiên BLOCKED nếu còn microtask thực hiện được.


|Nhãn|Khi gắn|Chỉ gỡ khi|
|---|---|---|
|gate:needs-spec|Thiếu quyết định/contract cần cho bước tiếp|Có quyết định đúng thẩm quyền, version/source và task được cập nhật.|
|gate:needs-review|Có diff/artifact đã bàn giao đang chờ review|Reviewer khác người viết có kết luận đúng SHA/diff; findings cần sửa đã được giải quyết.|
|gate:needs-test-env|Thiếu target/fixture/quyền test đã nêu|Probe/target grant đúng scope và người test tiếp nhận; không chỉ container đang chạy.|
|gate:needs-qa|Code/harness được bàn giao, QA chưa kết luận|Có test run đúng scope/SHA/digest, expected/actual, defect/retest và acceptance.|
|gate:needs-deploy|Issue có DoD cần runtime server nhưng chưa deploy đúng version|Có deployment identity/service digest, readiness và smoke; publish image không đủ.|
|gate:needs-handoff|Receipt hồ sơ/người nhận còn thiếu|Người nhận xác nhận đúng baseline, scope và quyền; tài liệu tồn tại chưa đủ.|
|blocked|Không còn việc scope có thể tiếp tục vì dependency/quyền/decision|Unlock đạt, owner xác nhận; chờ review/test không tự động là blocked.|



W01 hiện theo plan là local API/DB/browser; **không tự thêm needs-deploy sandbox/Mekong làm gate W01**. Gate E02a đã có probe test riêng ở snapshot cũ nhưng cần readback trước áp needs-test-env; không mặc định mọi QA đều thiếu DB.

## 6. Code, publish, deploy và QA phải truy vết độc lập

PR liên kết issue bằng related reference hoặc closing keyword chỉ khi phạm vi đáp ứng đúng DoD; reviewer kiểm trước merge để tránh đóng sớm. Không reopen toàn bộ issue đã đóng chỉ vì server chưa update nếu QA/deploy là issue nghiệm thu riêng.

Ví dụ: #168 đã CLOSED nhưng còn checklist QA migration047 trong body và có #173 riêng. Cần đối soát DoD/closing reference/QA record, không tự gắn qa-pass, không tự reopen hoặc coi code chưa viết. #169 vẫn OPEN dù có PR178 đã merge: cần kiểm phạm vi còn lại, không tự đổi Done từ merge.

Hồ sơ release phải có source SHA, linked PR/issues, API/UI immutable digests, workflow/runURL, target, deployment identity, schema/migration version, QA run và acceptance. Không dùng các label deployed/verified/PASS làm bằng chứng thay record. Một issue có target:sandbox chỉ mô tả nơi cần kiểm, không xác nhận sandbox đã chạy đúng commit.

## 7. Ánh xạ và tương thích label cũ

Bảng issue-label-map.csv có toàn bộ21issue: nhãn hiện có, nhãn đề xuất, milestone/dependencies, phần chưa triage và nguồn. Không đổi state/assignee khi backfill.


|Issue|Ví dụ nhãn đề xuất|Điểm cần giữ|
|---|---|---|
|#158|wbs:W00 role:BE type:docs priority:P2 area:api area:database gate:needs-handoff|Hồ sơ đã có, receipt chưa được giả là hoàn tất.|
|#162|wbs:W01 role:BE type:test priority:P1 area:api area:database risk:data target:local|Depends-on#161, không tự gắn blocked/needs-test-env từ suy đoán.|
|#173|role:QA type:test area:auth area:database risk:security risk:data meta:needs-triage|Hiện enhancement chưa phản ánh QA; WBS/priority/target còn cần triage.|
|#179|role:BE type:bug area:api risk:breaking-change meta:needs-triage|Có hành vi400/422 không nhất quán; severity/priority chưa chốt.|
|#180|role:BE type:bug area:storage risk:data meta:needs-triage|Giữ issue open; phân loại không thay nghiệm thu sửa S3 key.|



Dùng namespace type:* nhất quán. Mapping chuyển bug→type:bug, enhancement→type phù hợp từng issue (feature/refactor/test/bug/chore), documentation→type:docs; **không đổi enhancement hàng loạt thành feature**. Chỉ bỏ label cũ nằm trong allowlist khi nhãn mới đã readback và được duyệt áp dụng. Không rename/delete label toàn repo; giữ good first issue/help wanted/question/duplicate/invalid/wontfix vì khác mục đích. Không gắn type:bug và type:feature đồng thời để né triage.

## 8. Cách áp dụng có kiểm chứng

1. Review policy + mapping21issue + gate-register; metadata thiếu thì HOLD đúng row/field, không áp gate từ mapping chưa đủ owner/evidence. Đóng metadata cần input và ghi người chốt; không cần chặn phân loại role/type đã đủ căn cứ ở issue khác. Snapshot nguồn là thời điểm khảo sát, không phải khóa repo.
2. Preflight: kiểm quyền label/issue/milestone; đọc lại updatedAt/currentlabels, so snapshot. Nếu drift, giữ thay đổi người khác và rebase mapping issue đó.
3. Tạo các nhãn đang dùng, mô tả/color theo label-catalog.json. Milestone chỉ tạo/reuse sau readback title/id; không tự đặt due date.
4. Add nhãn mới từng issue, giữ label không sở hữu. Readback thành công mới remove đúng bug/enhancement/documentation trong mapping; ghi before/after/error và tiếp tục an toàn.
5. Không tự gán assignee hoặc state. Gate/milestone/priority còn pending giữ unresolved; không auto-run CI/deploy từ việc gắn nhãn.
6. Hậu kiểm: cardinality, WBS↔milestone, dependency không vòng, priority/severity đủ source, gate record đủ, labels bảo toàn, scope không đổi. Không tuyên bố atomic apply nhiềuissue; có journal perissue/idempotent resume.
7. Rollback chỉ các nhãn task đã thêm và restore label cũ task đã bỏ khi trạng thái chưa bị người khác thay; nếu drift thì HOLD/reconcile, không replace toàn bộ label list.

**Chưa áp dụng lên GitHub.** Yêu cầu hiện tại là bổ sung giải pháp và review. Các file local giữ ngoài Git; không CI/CD/deploy, không sửa code hay long-term memory. Review độc lập ghi file riêng với hash policy/mapping; không tự gán review:pass trên repo.

## 9. Validation và quản lý thay đổi

Tiêu chí review: đủ loại công việc BE/FE/QA; không nhầm target với chứng cứ; không tạo gate ngoài W01 local; không nhầm priority/severity; có migration label cũ, dependency/ownership và rollback giữ WIP; mọi mapping có source/unknown rõ. R1.1 bổ sung sau review độc lập: sửa đủ dependencies#173/#174, thêm gate records/owner pending và crosswalk tracker. R1 cũ được lưu archive/R1 cùng manifest. Đây là policy vận hành issue, không thay acceptance R2 hay là chứng nhận ISO.

Nguồn: evidence/issues.json, evidence/labels.json; plan W00/W01-R1 + tracking-procedure.md; bằng chứng deployment trace ở ../pr-deploy-check-20261105/.

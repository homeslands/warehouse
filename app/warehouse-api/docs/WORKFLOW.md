# Quy trình làm 1 tính năng mới cho warehouse-api

Áp dụng khi làm feature nghiệp vụ mới (product/stock/inventory...) bằng Claude Code. Convention chi tiết (entity/DTO/response/auth...) xem `../CLAUDE.md`, tài liệu này chỉ mô tả **thứ tự các bước**.

## 1. Viết spec (bỏ qua nếu feature là CRUD thuần, không có quy tắc nghiệp vụ)

Copy `docs/specs/_TEMPLATE.md` → `docs/specs/<feature>.md`, điền:
- Entity/field thật (không dùng field mẫu của `example/`).
- Quy tắc nghiệp vụ (điều không tự suy ra được từ CRUD, vd ràng buộc xoá/sửa, cách tính giá).
- Phân quyền theo role cho từng action.
- Danh sách API.
- Out-of-scope + câu hỏi mở.

Xem `docs/specs/product.md` làm ví dụ điền mẫu.

## 2. Vào Plan mode

Yêu cầu Claude: *"đọc spec `docs/specs/<feature>.md`, lập plan implement"*. Claude sẽ đọc spec + `CLAUDE.md` + `src/example/`, chốt các câu hỏi mở thành quyết định cụ thể, liệt kê thứ tự bước + danh sách file sẽ tạo/sửa.

Plan được lưu vào `docs/plans/<feature>.md` (đã cấu hình `plansDirectory` trong `.claude/settings.json`, commit được vào git). Xem `docs/plans/product.md` làm ví dụ.

## 3. Duyệt plan

Đọc lại nội dung Claude đề xuất, sửa nếu hiểu sai ý spec hoặc chọn giải pháp không đúng ý, rồi mới approve.

## 4. Code

Sau khi approve, 2 cách:
- Gõ `/new-feature <tên>` để tự động scaffold khung module (copy `example/`, đổi tên, đăng ký `app.module.ts`/`app.validation.ts`, sinh migration) theo checklist trong `CLAUDE.md`.
- Hoặc để Claude code trực tiếp theo plan đã duyệt.

## 5. Auto-lint

Mỗi lần Claude sửa file `.ts` trong `src/`, hook (`.claude/hooks/lint-warehouse-api.js`) tự chạy `eslint --fix` ngay trong turn đó — không cần đợi tới cuối.

## 6. Migration

```bash
npm run typeorm:g --name=create-<feature>-table   # generate
npm run typeorm:r                                 # chạy (đã allowlist, không cần hỏi)
```

Review diff migration trước khi chạy. `npm run typeorm:rv` (revert) luôn phải hỏi xác nhận trước — không tự chạy.

**Riêng endpoint có gắn `@RequireAuthority(...)`:** mỗi lần thêm/sửa/xoá decorator này trên bất kỳ endpoint nào, phải viết kèm 1 migration thêm/sửa/xoá `Authority` row tương ứng trong cùng lần đổi code — không tách làm sau, không dựa vào tự phát hiện lúc chạy app (xem `docs/specs/authority-permission.md`). Quên bước này = endpoint đó chỉ `SUPER_ADMIN` gọi được, không role nào khác có quyền cho tới khi migration được viết.

## 7. Verify trước khi báo xong

Claude tự chạy `npm run lint`, `npm run test` (và `npm run test:e2e` nếu đổi route/hành vi API), sửa lỗi nếu có. Nếu có đổi route/hành vi API, chạy tiếp skill `verify-feature` (`.claude/skills/verify-feature/SKILL.md`) — chạy app thật, gọi thử từng route + từng quy tắc nghiệp vụ trong spec, không chỉ dựa vào unit test. Cuối cùng tóm tắt: đã tạo/sửa file nào, đăng ký ở đâu, migration đã chạy hay chưa, kết quả verify route nào pass/fail.

## Sửa lại feature đã xong

### Feature đã có spec (đi qua đúng quy trình trên)

- **Bug nhỏ, đúng thiết kế, sai logic/thiếu case**: nói thẳng yêu cầu sửa (vd "route X đang trả sai khi Y"), không cần đụng tới spec/plan — Claude sửa trực tiếp, verify lại theo bước 7.
- **Hiểu sai/thiếu so với spec hiện có**: yêu cầu Claude đối chiếu `docs/specs/<feature>.md` với code, liệt kê chỗ lệch rồi sửa — không cần plan mới vì hướng đi (entity/kiến trúc) vẫn đúng.
- **Yêu cầu nghiệp vụ thật sự đổi** (vd đổi ngưỡng % giảm giá): **sửa trực tiếp trong file spec cũ** (`docs/specs/<feature>.md`), không tạo file mới kiểu `<feature>-v2.md`. Sau đó yêu cầu Claude lập lại plan (Bước 2) dựa trên phần chênh lệch, duyệt, code, rồi **ghi đè `docs/plans/<feature>.md`** bằng plan mới — plan luôn phản ánh trạng thái mới nhất, lịch sử "trước đây thế nào" đã có sẵn trong git log của file đó.
- Chỉ tách file spec mới khi thay đổi là **1 entity/module mới thực sự tách biệt** (dù liên quan tới feature cũ), không phải chỉ thêm field/đổi rule trong module hiện có.

### Feature cũ code tay, chưa từng có spec

1. Yêu cầu Claude đọc code hiện có, viết ngược lại thành spec theo `docs/specs/_TEMPLATE.md`, lưu vào `docs/specs/<feature>.md` — spec phản ánh đúng **hành vi thực tế của code**, không phải bịa ý tưởng mới.
2. Tự review lại spec vừa sinh: Claude "đọc code đoán ra" có thể thiếu ngữ cảnh (rule đó cố ý hay là bug) — sửa lại cho đúng ý định thật, bổ sung mục "Câu hỏi mở" nếu còn điểm chưa chắc.
3. Sửa trực tiếp trong spec đó theo yêu cầu thay đổi mới (cùng file, không tạo file riêng).
4. Yêu cầu Claude so sánh spec (đích) với code hiện tại (hiện trạng), lập plan chỉ tập trung phần chênh lệch — không viết lại toàn bộ module.
5. Duyệt plan → code → auto-lint → verify như quy trình bình thường (bước 3-7 ở trên).

Lợi ích: từ lần sau feature đó đã có spec sẵn trong repo — không phải đọc code đoán lại mỗi lần cần sửa.

---

## Tham chiếu nhanh

| Việc | File/lệnh |
|---|---|
| Convention đầy đủ | `../CLAUDE.md` |
| Setup môi trường lần đầu | `../setup.md` |
| Spec template | `docs/specs/_TEMPLATE.md` |
| Plan lưu ở | `docs/plans/` |
| Scaffold nhanh | `/new-feature <tên>` |
| Verify route thật (không chỉ unit test) | skill `verify-feature` (`.claude/skills/verify-feature/`) |

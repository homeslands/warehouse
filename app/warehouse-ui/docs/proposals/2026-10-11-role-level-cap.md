# Đề xuất: chặn tạo vai trò cấp ≥ SUPER_ADMIN (WMS-15 phần 2)

- Ngày: 2026-10-11
- Người viết: FE (warehouse-ui)
- Trạng thái: **chờ backend** — FE đã tự chặn ở form tạo vai trò (trần = cấp SUPER_ADMIN − 1), backend chưa chặn.

Đối chiếu `app/warehouse-api/src/role/role.service.ts`, `role.dto.ts`, `src/user/user.service.ts` (commit `c47053c`).

## Vấn đề

1. `CreateRoleRequestDto.level` chỉ có `@IsInt() @Min(1)`, không có trần.
2. `RoleService.actorLevel` trả `Infinity` cho SUPER_ADMIN → `assertCanManage(actor, dto.level)` luôn qua: SUPER_ADMIN
   tạo được vai trò cấp 100, 150, 10⁹…
3. Mọi luật cấp bậc sau đó chỉ so `level` thật, không phân biệt SUPER_ADMIN bằng tên ở phía **đích**:
   - `UserService.changeUserRole`: người mang vai trò `X` cấp 150 gán được vai trò **SUPER_ADMIN** (cấp 100 < 150) cho
     người khác (hoặc cho tài khoản phụ của mình) → leo thang thành SUPER_ADMIN, bypass toàn bộ `AuthorityGuard`.
   - `assertCanManage` cho sửa mô tả / xoá / phân quyền vai trò: `X` quản lý được ADMIN, MANAGER… và cả mô tả của
     SUPER_ADMIN.
   - Cấp bằng 100 (ngang SUPER_ADMIN) cũng nguy hiểm theo hướng ngược: không ai ngoài SUPER_ADMIN quản lý được nó, nhưng
     nó không bypass như SUPER_ADMIN — dễ nhầm khi đọc ma trận.

## Đề xuất

1. **Trần khi tạo:** `level` < cấp của SUPER_ADMIN (đọc từ bảng `role`, không hard-code 100). Gợi ý: trong
   `RoleService.create`, khi actor là SUPER_ADMIN thì so `dto.level` với `level` của bản ghi SUPER_ADMIN; vượt → 100104
   (hoặc mã mới, vd `ROLE_LEVEL_EXCEEDS_SUPER_ADMIN`). Thêm `@Max` ở DTO nếu muốn chặn sớm số quá lớn (cột `int`).
2. **Chặn gán SUPER_ADMIN qua `change-role` / tạo người dùng** cho mọi actor không phải SUPER_ADMIN, bất kể cấp — phòng
   khi DB đã có sẵn vai trò cấp ≥ 100.
3. **Dữ liệu cũ:** kiểm `SELECT name, level FROM role WHERE level >= (SELECT level FROM role WHERE name = 'SUPER_ADMIN')`
   (kể cả đã xoá mềm); có thì hạ cấp hoặc xoá trước khi bật luật.

## FE đã làm

- `maxCreatableLevel` (`src/entities/user/model/role-level.ts`): SUPER_ADMIN cũng có trần = cấp SUPER_ADMIN − 1 (lấy
  từ `/auth/me` hoặc danh sách vai trò, lùi về 99). Form tạo hiện "Bạn tạo được cấp 1–99" và chặn cấp ≥ 100 tại ô.
- Chỉ là rào giao diện: gọi thẳng API vẫn tạo được — cần mục 1–2 ở backend.

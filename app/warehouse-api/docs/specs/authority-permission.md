# Spec: authority-permission

## Mục tiêu

`warehouse-api` đã có sẵn 4 entity `Role`/`Authority`/`AuthorityGroup`/`Permission` (`src/role/`) nhưng chưa có controller/service nào thao tác chúng, và guard hiện tại (`src/role/role.guard.ts`) chỉ so `user.roleName` với danh sách `RoleEnum` viết cứng qua `@HasRoles(...)`. Feature này bổ sung API quản trị để bật/tắt quyền của từng role theo từng authority, và đổi guard sang đọc dữ liệu đó — mỗi endpoint chỉ khai 1 authority-key, không liệt kê role trong code. Kết quả: 1 giao diện admin (switch bật/tắt từng ô) có thể thay đổi quyền truy cập API thật, không cần sửa code/deploy lại.

## Entity / dữ liệu

Giữ 4 entity hiện có (`Role`/`AuthorityGroup`/`Authority`/`Permission`), nhưng **thêm 1 field mới trên `Authority`**: cột `code` (unique, bắt buộc, không đổi được qua API sau khi tạo) — dùng làm khoá cho `@RequireAuthority(code)` trong code. Không tái dùng `slug` sẵn có của `Base` cho việc này, vì `slug` mang nghĩa "định danh hiển thị/URL" (được phép đổi) — dùng nó làm khoá tra cứu quyền truy cập sẽ tạo rủi ro sửa nhầm làm đứt liên kết với `@RequireAuthority(...)` trong code. Tách riêng `code` (machine key, cố định) khỏi `slug` (định danh REST, có thể đổi).

| Entity | Bảng | Field liên quan |
|---|---|---|
| `Role` | `role_tbl` | `name` (`RoleEnum`), `permissions` (OneToMany `Permission`) — không đổi |
| `AuthorityGroup` | `authority_group_tbl` | `name` — không đổi, chỉ để nhóm hiển thị trên UI |
| `Authority` | `authority_tbl` | `name` (hiển thị), **`code` (mới — unique, `SCREAMING_SNAKE_CASE`, vd `EXAMPLE_CREATE`, dùng trong `@RequireAuthority(code)`)**, `authorityGroup` — không đổi các field khác |
| `Permission` | `permission_tbl` | join `role` × `authority` — có row = role được cấp quyền đó; xoá row = thu hồi — không đổi |

Quan hệ: `Role hasMany Permission`, `Authority hasMany Permission`, `AuthorityGroup hasMany Authority`.

Cần migration thêm cột `code_column` (unique) vào `authority_tbl`.

**Tách module theo entity** (đổi từ 1 module `src/role/` gộp cả 4 entity sang 4 module riêng, đúng convention "1 entity = 1 module" trong `CLAUDE.md`):

| Module | Thư mục | Sở hữu |
|---|---|---|
| Role | `src/role/` | `Role` entity, `RoleEnum`, `AuthorityGuard` (`role.guard.ts`) — guard ở lại đây vì cần `RoleEnum` để check `SUPER_ADMIN` bypass |
| Authority | `src/authority/` | `Authority` entity, `@RequireAuthority` (`authority.decorator.ts`) — decorator đặt theo đúng tên nó mô tả (authority-key), không phải theo nơi guard tiêu thụ nó; `role.guard.ts` import decorator này bằng import TS thuần (không phải qua NestJS module), không tạo phụ thuộc vòng giữa `RoleModule`/`AuthorityModule` |
| AuthorityGroup | `src/authority-group/` | `AuthorityGroup` entity |
| Permission | `src/permission/` | `Permission` entity — service cần đọc `Role`/`Authority` nên `PermissionModule` import `RoleModule`/`AuthorityModule` (cả 2 export `RoleService`/`AuthorityService`, không export `TypeOrmModule`) thay vì tự khai lại `forFeature` cho entity không thuộc sở hữu |

Đây là thay đổi thuần cấu trúc (tách file/module), không đổi hành vi API hay quy tắc nghiệp vụ bên dưới.

## Quy tắc nghiệp vụ

**3 trạng thái decorator trên 1 endpoint (loại trừ lẫn nhau):**

| Decorator trên endpoint | Cần JWT hợp lệ? | Check quyền cụ thể? |
|---|---|---|
| `@Public()` | Không | Không check gì cả |
| Không gắn gì | Có | Không — bất kỳ role nào đã đăng nhập đều gọi được |
| `@RequireAuthority(code)` | Có | Có — role của user phải có `code` đó trong `permission_tbl` (trừ `SUPER_ADMIN` luôn qua, không cần cấp tường minh) |

**Đồng bộ code ↔ DB bằng migration tay (không tự phát hiện):**

- `Authority` row **không được tự tạo lúc runtime**. Mỗi khi thêm/sửa/xoá `@RequireAuthority(code)` trên 1 endpoint, người code **phải viết kèm 1 migration** tương ứng thêm/sửa/xoá `Authority` row đó — cùng lúc với PR đổi code, không tách rời. Quy tắc này áp dụng cho mọi feature sau này, không riêng feature này (xem mục "Cập nhật quy trình" bên dưới).
- Nếu `@RequireAuthority(code)` tham chiếu 1 `code` không tồn tại trong DB → guard coi như **không role nào có quyền đó** (trừ `SUPER_ADMIN`) — an toàn (không mở toang) nhưng có thể vô tình khoá endpoint nếu quên viết migration, nên đây là lý do bắt buộc migration phải đi kèm ngay trong cùng 1 lần thay đổi code, không được làm sau.
- Role khác (kể cả `ADMIN`) chỉ có quyền `X` khi tồn tại row `Permission(role, authority.code = X)`.
- Bật/tắt 1 quyền là 1 hành động độc lập (không phải thay thế cả danh sách): "bật" = tạo `Permission` nếu chưa có (idempotent), "tắt" = xoá `Permission` nếu có (idempotent). Khớp thao tác UI: mỗi lần bấm 1 switch chỉ gửi 1 request cho đúng 1 ô role × authority.
- `Authority.code` không cho sửa qua API update (immutable qua API — migration tay thì vẫn sửa thẳng DB được nếu thật sự cần đổi, nhưng phải tự cập nhật lại `@RequireAuthority(...)` trong code cùng lúc).
- Không cho xoá `AuthorityGroup` nếu còn `Authority` thuộc group đó.
- Không cho tạo `Authority` với `code` hoặc `AuthorityGroup` với `slug` đã tồn tại qua API.
- Quyền thay đổi (do admin bật/tắt qua API) có hiệu lực từ request tiếp theo của user bị ảnh hưởng, không cần đăng nhập lại — `scope` của user được cache trên Redis (SET `rbac:user:{userId}`, xem `docs/specs/rbac.md`), và `grant`/`revoke` xoá cache của mọi user thuộc role đó ngay sau khi ghi DB nên request kế tiếp đọc lại từ DB.
- Migration của chính feature này seed sẵn: `AuthorityGroup` cho `example`; `Authority` gồm `EXAMPLE_CREATE`/`EXAMPLE_UPDATE`/`EXAMPLE_DELETE` (thay cho `@HasRoles(Admin, SuperAdmin)` cũ trên `example.controller.ts`) và `MANAGE_PERMISSIONS` (cho chính API quản trị permission); cấp cả 4 quyền này cho role `ADMIN` để hành vi ngay sau migrate không đổi so với trước.

## Danh mục authority của 4 loại phiếu kho (bảng phân quyền 5.5)

Chia làm 2 chỗ theo vòng đời của từng thứ: **`code`** (khoá tra cứu bất biến, phải khớp `@RequireAuthority(...)`) nằm ở `src/authority/authority.constants.ts` dưới dạng hằng `AuthorityCode`; **tên hiển thị, nhóm hiển thị và quyền cấp sẵn cho từng role** nằm trong chính migration `1783728000012-seed-warehouse-form-authorities.ts`, vì cả 3 là DỮ LIỆU — sau khi migrate, nguồn sự thật là `authority_tbl`/`permission_tbl` và admin sửa được qua API, nên để chúng trong code app chỉ tạo ảo giác code là nguồn sự thật. Migration import `AuthorityCode` nên `code` trong DB không thể lệch với code app ngay từ lần seed đầu.

| Nhóm | Authority |
|---|---|
| `Import Form` | `IMPORT_FORM_CREATE`, `IMPORT_FORM_READ`, `IMPORT_FORM_UPDATE_DRAFT`(`_OWN`), `IMPORT_FORM_DELETE_DRAFT`(`_OWN`), `IMPORT_FORM_CONFIRM`, `IMPORT_FORM_EXPORT` |
| `Export Form` | như trên với tiền tố `EXPORT_FORM_`, thêm `EXPORT_FORM_APPROVE_DISPOSAL` (phê duyệt xuất hủy) |
| `Balance Form` | `BALANCE_FORM_CREATE`, `BALANCE_FORM_READ`(`_ASSIGNED`), `BALANCE_FORM_RECORD_COUNT`(`_ASSIGNED`), `BALANCE_FORM_COMPLETE`(`_ASSIGNED`), `BALANCE_FORM_APPROVE` |
| `Warehouse Payment` | `WAREHOUSE_PAYMENT_CREATE`, `WAREHOUSE_PAYMENT_READ`(`_OWN`), `WAREHOUSE_PAYMENT_UPDATE_DRAFT`(`_OWN`), `WAREHOUSE_PAYMENT_APPROVE`, `WAREHOUSE_PAYMENT_EXPORT` |

Ba quy ước dịch từ bảng 5.5 sang authority:

- **Ô "✓ (của mình)" / "✓ (được phân công)" → 1 `code` riêng có hậu tố `_OWN` / `_ASSIGNED`**, song song với bản đầy đủ. `AuthorityGuard` chỉ so khớp chuỗi trong `user.scope`, không nhìn thấy dữ liệu phiếu — tách 2 `code` thì admin mới bật/tắt riêng từng mức qua API; còn việc kiểm "đúng phiếu của mình / đúng người được phân công" vẫn phải làm ở tầng service (row-level).
- **Ô ✗ với cả 3 role ("Sửa Confirmed", "Xóa Confirmed") KHÔNG có `code`.** Đó là bất biến nghiệp vụ, không phải quyền đang tắt: tạo `code` rồi để 0 role thì admin vẫn bật được qua API và phá luôn bất biến. Chặn ở service/state machine.
- **"Tạo từ nhập kho (auto)" của phiếu chi KHÔNG có `code`** — phiếu do hệ thống sinh kèm phiếu nhập, không phải endpoint người dùng gọi; quyền quyết định thực chất nằm ở phiếu nhập. Tương tự, ô "✓ (người duyệt)" của `MANAGER` khi duyệt phiếu chi = có `WAREHOUSE_PAYMENT_APPROVE` + check row-level "đúng người được chỉ định duyệt" ở service.

## Cập nhật quy trình (WORKFLOW.md / CLAUDE.md)

Thêm quy tắc mới, áp dụng cho mọi feature từ nay về sau: **khi checklist "gắn `@RequireAuthority(...)` nếu cần giới hạn truy cập" được thực hiện (thêm mới/sửa/xoá), phải viết kèm 1 migration thêm/sửa/xoá `Authority` row tương ứng trong cùng lần thay đổi** — không tách thành việc làm sau, không dựa vào tự phát hiện lúc chạy app. Cập nhật cụ thể:
- `docs/WORKFLOW.md` — bước 6 "Migration": thêm ghi chú quy tắc trên.
- `CLAUDE.md` — mục "Guard & decorator xác thực/phân quyền" (đổi `@HasRoles` → `@RequireAuthority`) và bước 6+8 trong "Checklist khi tạo feature mới".

## Quyền truy cập

| Action | Authority yêu cầu |
|---|---|
| `GET /authorities`, `GET /authority-groups`, `GET /roles`, `GET /roles/:slug` | Không gắn — mọi user đã login |
| `POST/PATCH/DELETE /authority-groups` | `MANAGE_PERMISSIONS` |
| `PATCH /authorities/:slug` (chỉ sửa `name`/`authorityGroup`, không sửa `code`) | `MANAGE_PERMISSIONS` |
| `POST/PATCH /roles` | `MANAGE_PERMISSIONS` |
| `PUT /roles/:roleSlug/authorities/:authorityCode` (bật), `DELETE` cùng path (tắt) | `MANAGE_PERMISSIONS` |
| `POST /examples`, `PATCH /examples/:slug`, `DELETE /examples/:slug` | `EXAMPLE_CREATE` / `EXAMPLE_UPDATE` / `EXAMPLE_DELETE` |

`Authority`/`AuthorityGroup` **không có API tạo/xoá** — tạo/xoá chỉ qua migration (đúng quy tắc "đồng bộ code ↔ DB bằng migration tay" ở trên). API chỉ có `GET` (đọc) và `PATCH` (sửa `name`/nhóm hiển thị, không đổi `code`).

## API cần có

- `GET /authority-groups`
- `GET /authorities` (filter theo group), `PATCH /authorities/:slug` (sửa `name`/`authorityGroupSlug`)
- `GET /roles`, `GET /roles/:slug` (kèm danh sách `authorityCodes` đang được cấp cho role đó)
- `POST /roles`, `PATCH /roles/:slug`
- `PUT /roles/:roleSlug/authorities/:authorityCode` — bật 1 quyền cho 1 role (idempotent)
- `DELETE /roles/:roleSlug/authorities/:authorityCode` — tắt 1 quyền của 1 role (idempotent)

## Ngoài phạm vi (Out of scope)

- Không có API tạo/xoá `Authority`/`AuthorityGroup` — cố tình, để buộc đi qua migration (xem "Cập nhật quy trình"), tránh lệch code/DB.
- Không tự phát hiện `@RequireAuthority(...)` lúc runtime.
- Không làm endpoint đổi role của user khác (nợ kỹ thuật sẵn có, ghi trong `CLAUDE.md`, không thuộc feature này).
- Cách cache `scope`/permission trên Redis (key, TTL, invalidation, fail-open) nằm ở spec riêng `docs/specs/rbac.md` — spec này chỉ định nghĩa mô hình quyền, không định nghĩa nơi đọc.
- Không đổi `RoleBasedSerializationInterceptor` (ẩn/hiện field response theo role) — đó là serialization theo role, khác access-control theo authority, giữ nguyên.
- Chưa hỗ trợ authority cho action ngoài REST endpoint (cron job, queue consumer...).

## Câu hỏi mở / chưa chốt

Không có — đã chốt với user: 3 trạng thái decorator, `SUPER_ADMIN` bypass toàn bộ, `Authority.code` tách riêng `slug`, đồng bộ code ↔ DB bằng migration tay bắt buộc (không tự phát hiện), quy tắc này được đưa vào `WORKFLOW.md`/`CLAUDE.md` áp dụng cho mọi feature sau này.

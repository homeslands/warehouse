# Đề xuất: gác endpoint nghiệp vụ bằng authority thay cho role

- Người đề xuất: frontend (warehouse-ui)
- Ngày: 2026-09-24
- Trạng thái: **backend đã làm** — `WMS-10-be(1)`, `WMS-10-be(2)` (2026-09-25); FE đã bật cờ
- Căn cứ: code trên `origin/dev` ngày 2026-09-24

## Kết quả (2026-09-25)

Backend chuyển **mọi** endpoint nghiệp vụ sang `@RequireAuthority`, rộng hơn đề xuất (thêm đơn vị),
và seed mặc định chép đúng `@HasRole` cũ. Danh mục lên **60 mã**. Những chỗ backend làm **khác**
bảng đề xuất bên dưới — phần dưới giữ nguyên làm lịch sử, **đừng đọc nó như hiện trạng**:

| Đề xuất | Backend làm |
|---|---|
| `STORE_ASSIGN_WAREHOUSE` cho `PUT /stores/:slug/warehouse` | Không có mã riêng: `@RequireAuthority(StoreUpdate, WarehouseUpdate)` |
| `MATERIAL_TYPE_*` riêng cho loại vật tư | Dùng chung `MATERIAL_*` |
| `WAREHOUSE_MATERIAL_*` riêng cho vật tư trong kho | `MATERIAL_*` + `WAREHOUSE_*` (vd sửa = `MaterialUpdate, WarehouseUpdate`) |
| `WAREHOUSE_MATERIAL_ADJUST_QUANTITY` | Không tách: `MaterialUpdate, WarehouseUpdate` |
| `TAX_PROFILE_REFRESH` | `TAX_PROFILE_UPDATE` |
| — | Thêm `UNIT_*` (module đơn vị mới) |

**Nhiều mã trong một `@RequireAuthority` là AND** (`authority.decorator.ts`, `role.guard.ts`: `every`).
Route nối hai tài nguyên không có mã riêng — FE gác bằng `can(A) && can(B)`.

Ba việc kèm theo ở cuối file: **chưa làm** (403 vẫn trả `"Forbidden resource"` không `code`; chưa có
`x-authority` trên Swagger; có test decorator từng controller nhưng chưa có test quét toàn bộ).

## Vấn đề

Backend đã dựng xong hạ tầng phân quyền động: 46 mã trong `authority.constants.ts`, bảng
`permission_tbl`, API bật/tắt (`PUT`/`DELETE /roles/:roleSlug/authorities/:authorityCode`), và
cache `rbac:user:{userId}` bị xoá khi đổi quyền. Frontend đã có màn `/permissions` dùng API này.

Nhưng **chỉ 6/46 mã được endpoint nào đó kiểm tra**:

| Mã | Endpoint |
|---|---|
| `MANAGE_PERMISSIONS` | `POST`/`PATCH /roles`, `PATCH /authorities/:slug`, `PUT`/`DELETE /roles/:roleSlug/authorities/:authorityCode` |
| `LOGGER_READ` | `GET /logger` |
| `DB_BACKUP` | `POST /db` |
| `EXAMPLE_CREATE` / `_UPDATE` / `_DELETE` | `POST` / `PATCH` / `DELETE /examples` |

Mọi endpoint nghiệp vụ khác gác bằng `@HasRole`. Hệ quả thấy được: admin bật `WAREHOUSE_CREATE`
cho MANAGER ở màn phân quyền, `/auth/me` trả đúng mã đó trong `scope`, nhưng `POST /warehouses`
vẫn trả 403 cho MANAGER (`warehouse.controller.ts:37` — `@HasRole(RoleEnum.Admin)`). 40 switch
trên màn phân quyền hiện không có tác dụng.

Frontend không tự sửa được: nếu FE hiện nút theo `scope` trong khi backend hỏi role, người dùng
thấy nút rồi ăn 403.

## Đề xuất

**Mỗi endpoint nghiệp vụ gắn đúng một `@RequireAuthority(code)`.** Role chỉ còn là một gói quyền
trong dữ liệu. `@HasRole` giữ lại cho chỗ nào thật sự mang tính cấu trúc, hoặc bỏ hẳn.

### Nhóm A — đã có mã, chỉ đổi decorator

Seed mặc định của các mã này **khớp đúng** các `@HasRole` hiện tại (`defaultRoles` trong
`1783728000014-seed-warehouse-authorities.ts`; migration `…010`, `…011`). Vậy trên DB đang ở seed
mặc định, đổi decorator **không làm thay đổi ai được làm gì**.

| Endpoint | Hiện tại | Đổi thành | Seed mặc định |
|---|---|---|---|
| `POST /warehouses` | `HasRole(Admin)` | `WAREHOUSE_CREATE` | Admin |
| `GET /warehouses`, `GET /warehouses/:slug` | `HasRole(Admin, Manager, Supervisor)` | `WAREHOUSE_READ` | Admin, Manager, Supervisor |
| `PATCH /warehouses/:slug` | `HasRole(Admin)` | `WAREHOUSE_UPDATE` | Admin |
| `PUT /warehouses/:slug/manager` | `HasRole(Admin)` | `WAREHOUSE_ASSIGN_MANAGER` | Admin |
| `DELETE /warehouses/:slug` | `HasRole(Admin)` | `WAREHOUSE_DELETE` | Admin |
| `POST /users` | `HasRole(Admin)` | `USER_CREATE` | Admin |
| `GET /users` | `HasRole(Admin)` | `USER_READ` | Admin |
| `POST /users/:userSlug/change-password` | `HasRole(Admin, Manager)` | `USER_CHANGE_PASSWORD` ¹ | Admin, Manager |

¹ Cần backend xác nhận ý nghĩa: tên mã nghe như "đổi mật khẩu của mình", nhưng endpoint này là
**đặt lại mật khẩu cho người khác**. Tự đổi mật khẩu (`POST /auth/change-password`) không gác
riêng. Nếu mã này dành cho việc khác thì cần một mã mới, ví dụ `USER_RESET_PASSWORD`.

### Nhóm B — chưa có mã, cần thêm mã + migration seed

`authority.constants.ts` chưa có mã nào cho các module dưới đây. Đề xuất đặt tên theo khuôn đang
dùng (`<MODULE>_<HÀNH_ĐỘNG>`), và cho `defaultRoles` **khớp đúng `@HasRole` hiện tại** để lúc
deploy không ai mất hay được thêm quyền.

| Module | Endpoint | Mã đề xuất | `defaultRoles` (= hiện tại) |
|---|---|---|---|
| Cửa hàng | `POST /stores` | `STORE_CREATE` | Admin |
| | `GET /stores`, `GET /stores/:slug` | `STORE_READ` | Admin, Manager, Supervisor |
| | `PATCH /stores/:slug` | `STORE_UPDATE` | Admin |
| | `PUT /stores/:slug/warehouse` | `STORE_ASSIGN_WAREHOUSE` | Admin |
| | `DELETE /stores/:slug` | `STORE_DELETE` | Admin |
| Vật tư | `POST` / `PATCH` / `DELETE /materials…` | `MATERIAL_CREATE` / `_UPDATE` / `_DELETE` | Admin |
| | `GET /materials`, `GET /materials/:slug` | `MATERIAL_READ` | Admin, Manager, Supervisor |
| Loại vật tư | `POST` / `PATCH` / `DELETE /material-types…` | `MATERIAL_TYPE_CREATE` / `_UPDATE` / `_DELETE` | Admin |
| | `GET /material-types…` | `MATERIAL_TYPE_READ` | Admin, Manager, Supervisor |
| Vật tư trong kho | `POST /warehouses/:warehouseSlug/materials` | `WAREHOUSE_MATERIAL_CREATE` | Admin |
| | `GET /warehouses/:warehouseSlug/materials` | `WAREHOUSE_MATERIAL_READ` | Admin, Manager, Supervisor |
| | `PATCH …/materials/:materialSlug` | `WAREHOUSE_MATERIAL_UPDATE` | Admin |
| | `PATCH …/materials/:materialSlug/quantity` | `WAREHOUSE_MATERIAL_ADJUST_QUANTITY` ² | Admin |
| | `DELETE …/materials/:materialSlug` | `WAREHOUSE_MATERIAL_DELETE` | Admin |
| Hồ sơ thuế | `GET /tax-profiles…` | `TAX_PROFILE_READ` | Admin, Manager, Supervisor |
| | `POST /tax-profiles/:taxCode/refresh` | `TAX_PROFILE_REFRESH` | Admin |

² Tách riêng khỏi `_UPDATE`: sửa số lượng tồn là thao tác nhạy cảm hơn sửa thông tin, admin nên
bật/tắt được độc lập.

## Rủi ro khi deploy: môi trường đã có người bật/tắt quyền

Câu "đổi decorator không làm thay đổi ai được làm gì" **chỉ đúng khi `permission_tbl` còn ở seed
mặc định**. Ở môi trường đã có người thao tác trên màn phân quyền, các ô đang "chết" sẽ **sống lại
ngay lúc deploy**. Ví dụ thật: trên sandbox ngày 2026-09-24, `/auth/me` của một tài khoản MANAGER
có `WAREHOUSE_CREATE` và `EXAMPLE_CREATE` trong `scope`. Sau khi đổi decorator, MANAGER đó tạo được
kho thật.

Đề xuất: trước khi deploy lên mỗi môi trường, so `permission_tbl` với `defaultRoles` của các mã
trong nhóm A, rồi quyết định giữ hay reset từng ô lệch.

## Ba việc kèm theo (nên có)

1. **Test chặn "quên gác".** Quét metadata mọi method trong controller: method nào không có
   `@RequireAuthority`, `@HasRole` hay `@Public` thì test đỏ. Đây là thứ đã để lọt tình trạng
   "seed mã mà không gác" hiện nay.
2. **Mã lỗi riêng cho 403 do thiếu quyền.** Hiện `AuthorityGuard`/`HasRoleGuard` trả `false`, Nest
   ném `ForbiddenException` mặc định, và filter trả `{ statusCode: 403, message: "Forbidden resource" }`
   không có `code`. FE phải nhận diện bằng cách so **message tiếng Anh**. Không so được chỉ theo
   "403 không code", vì `FeatureGuard` (`fureture.guard.ts:21`) cũng trả 403 không code. Một `code`
   riêng (theo dải mã lỗi đang dùng) cho FE so chắc chắn.
3. **Đưa mã quyền vào Swagger.** Cho `@RequireAuthority` gắn thêm `@ApiExtension('x-authority', code)`
   để FE đọc được endpoint nào cần mã nào, thay vì đọc code backend.

## Phía frontend

**Đã bật** (2026-09-25) cả hai cờ `authorityGuards` và `storeAuthorityGuards` trong
`src/shared/api/backend-capabilities.ts`. Danh sách mã FE (`src/shared/api/authority-codes.ts`) đã
đồng bộ 60 mã; nút Gán kho của cửa hàng gác bằng `STORE_UPDATE` + `WAREHOUSE_UPDATE` (+ `WAREHOUSE_READ`
vì hộp tải danh sách kho). Cờ còn giữ cho giai đoạn chuyển tiếp, gỡ khi mọi môi trường đã chạy bản
backend mới.

Hiện trạng:

- Route: `handle.roles: [...]` → `handle.authority: '<MODULE>_READ'`.
- Nút: `hasRole(user, ROLES.ADMIN)` → `can(user, '<MÃ>')`, mỗi nút một mã. Cột Thao tác chỉ dựng
  khi còn ít nhất một nút.
- Khi 403 do thiếu quyền, FE đã tự nạp lại `/auth/me` để giao diện khớp quyền mới. Khi người dùng
  quay lại tab, FE cũng kiểm tra lại quyền. Phần này đã có sẵn.

Mẫu đã chạy thật: màn `/examples` gác ba nút bằng `EXAMPLE_CREATE` / `_UPDATE` / `_DELETE`.

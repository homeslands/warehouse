# Kho (Warehouse)

> Nguồn: `src/warehouse/warehouse.controller.ts`, `src/warehouse/warehouse.dto.ts`, `src/warehouse/warehouse.validation.ts`, `src/warehouse/warehouse.service.ts`, `src/warehouse/warehouse.mapper.ts`, `src/warehouse/warehouse.constants.ts`, `src/warehouse/guard/warehouse-scope.guard.ts`, `src/warehouse/decorator/warehouse-scope.decorator.ts` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).
> Mô tả code tại `main` `5555273`.

Endpoint con `/api/v1/warehouses/:warehouseSlug/materials...` (tồn kho) nằm ở [inventory.md](inventory.md). Phiếu nhập/xuất và lô vật tư theo kho nằm ở [import-form.md](import-form.md), [export-form.md](export-form.md), [material.md](material.md).

## Tóm tắt endpoint

| Method | Path | Quyền (authority, AND) | Mô tả |
|---|---|---|---|
| POST | /api/v1/warehouses | `WAREHOUSE_CREATE` | Tạo kho |
| GET | /api/v1/warehouses | `WAREHOUSE_READ` | Danh sách kho (phân trang, giới hạn theo phạm vi kho) |
| GET | /api/v1/warehouses/:slug | `WAREHOUSE_READ` | Chi tiết kho (giới hạn theo phạm vi kho) |
| PATCH | /api/v1/warehouses/:slug | `WAREHOUSE_UPDATE` | Sửa thông tin kho (partial) |
| PUT | /api/v1/warehouses/:slug/manager | `WAREHOUSE_ASSIGN_MANAGER` | Gán hoặc gỡ (`null`) quản lý kho |
| PUT | /api/v1/warehouses/:slug/members | `WAREHOUSE_UPDATE` + `USER_READ` | Gán user làm thành viên kho (idempotent) |
| GET | /api/v1/warehouses/:slug/members | `WAREHOUSE_READ` | Danh sách thành viên kho (giới hạn theo phạm vi kho) |
| GET | /api/v1/warehouses/:slug/available-members | `WAREHOUSE_UPDATE` + `USER_READ` | User có thể gán làm thành viên |
| DELETE | /api/v1/warehouses/:slug/members/:userSlug | `WAREHOUSE_UPDATE` + `USER_READ` | Gỡ user khỏi kho |
| DELETE | /api/v1/warehouses/:slug | `WAREHOUSE_DELETE` | Xoá mềm kho (kho phải đã ngừng hoạt động) |

`GET /api/v1/warehouses/mine` **không tồn tại** (đã comment ở `warehouse.controller.ts:87-105`). Gọi vào sẽ khớp route `GET /warehouses/:slug` với `slug = "mine"` và nhận `WAREHOUSE_NOT_FOUND` (404).

## Phạm vi kho (warehouse scope)

Hệ thống có hai lớp kiểm soát. Cả hai đều phải qua:

1. **Authority** (`@RequireAuthority`): role có được làm thao tác này không. Xem [conventions.md](conventions.md).
2. **Phạm vi kho**: user có thuộc kho này không. "Thuộc kho" nghĩa là user là **manager** của kho (`warehouse_tbl.manager_id_column`) **hoặc** là **thành viên** chưa bị gỡ (`warehouse_member_tbl`, row chưa xoá mềm).

Phạm vi kho được áp theo hai cách khác nhau. FE cần biết endpoint nào dùng cách nào:

| Cách | Áp ở đâu | Role được bỏ qua kiểm tra | Hành vi |
|---|---|---|---|
| Kiểm tra trong service (`assertCanRead` hoặc lọc `where`) | `GET /warehouses`, `GET /warehouses/:slug`, `GET /warehouses/:slug/members` (`warehouse.service.ts:99-121`, `:139-148`, `:155-180`, `:355-363`) | `ADMIN`, `SUPER_ADMIN` (`WAREHOUSE_UNSCOPED_ROLES`, `warehouse.constants.ts:22`) | Mọi role khác, kể cả role tự tạo và token không có claim `role`, chỉ thấy kho mình thuộc về (fail-closed). Danh sách: lọc bớt. Chi tiết/thành viên: `WAREHOUSE_ACCESS_DENIED` (403). |
| Decorator `@WarehouseScope(param)` + `WarehouseScopeGuard` (global, chạy sau `AuthorityGuard`) | **Không** dùng trong module warehouse. Dùng ở `import-form`, `export-form`, `material-batch` (`@WarehouseScope('warehouseSlug')`) | `ADMIN`, `SUPER_ADMIN` (`warehouse-scope.guard.ts:43`) | Kho không tồn tại: `WAREHOUSE_NOT_FOUND` (404). User không thuộc kho: `WAREHOUSE_ACCESS_DENIED` (403) (`warehouse-scope.guard.ts:55-57`). |

Các endpoint ghi của module này (`PATCH`, `PUT .../manager`, `PUT/DELETE .../members`, `GET .../available-members`, `DELETE`) **không** kiểm tra phạm vi kho. Chỉ authority quyết định. Theo seed mặc định, `WAREHOUSE_UPDATE`, `WAREHOUSE_ASSIGN_MANAGER`, `WAREHOUSE_DELETE`, `WAREHOUSE_CREATE` chỉ cấp cho `ADMIN` (`src/migrations/1783728000014-seed-warehouse-authorities.ts:25-56`). Quyền thật lấy từ `permission_tbl` lúc chạy, có thể đã khác seed.

FE lấy danh sách kho của user hiện tại (kèm cờ `isManager`) từ `GET /auth/me`, xem [auth.md](auth.md).

## Kiểu dùng chung

### `WarehouseResponseDto`

Nguồn: `warehouse.dto.ts:142-174`, map ở `warehouse.mapper.ts:60-69`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug` | `string` | Định danh public. Không bao giờ trả `id`. |
| `createdAt` | `string` | Định dạng xem [conventions.md](conventions.md) |
| `updatedAt` | `string` | |
| `name` | `string` | |
| `code` | `string` | Luôn viết HOA (mapper `toUpperCase()`, `warehouse.mapper.ts:28-31`) |
| `address` | `string` | |
| `phonenumber` | `string?` | Không có field nếu DB `NULL` (chưa xác minh: automapper có thể trả `null` thay vì bỏ field) |
| `description` | `string?` | Như trên |
| `isActive` | `boolean` | |
| `manager` | `WarehouseUserDto?` | Bỏ field khi kho chưa có quản lý (`warehouse.mapper.ts:42-50`) |

### `WarehouseUserDto` (tên class trong code: `WarehouseManagerDto`)

Nguồn: `warehouse.dto.ts:128-140`. Dùng cho `manager` của kho, `user` của thành viên kho, và `manager` của cửa hàng.

| Field | Kiểu |
|---|---|
| `slug` | `string` |
| `phonenumber` | `string` |
| `firstName` | `string` |
| `lastName` | `string` |

### `WarehouseMemberResponseDto`

Nguồn: `warehouse.dto.ts:176-180`, map ở `warehouse.mapper.ts:71-80`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug` | `string` | Slug của **row thành viên**, không phải slug của user |
| `createdAt` | `string` | Thời điểm row được tạo. Khi gán lại user từng bị gỡ, row cũ được khôi phục nên `createdAt` là lần gán đầu tiên (`warehouse.service.ts:253-263`) |
| `updatedAt` | `string` | |
| `user` | `WarehouseUserDto` | Dùng `user.slug` để gỡ thành viên |

## POST /api/v1/warehouses

- **Quyền:** `WAREHOUSE_CREATE` (`warehouse.controller.ts:41-61`).
- **Body:** `CreateWarehouseRequestDto` (`warehouse.dto.ts:17-55`). Field lạ bị bỏ (`whitelist: true`).

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `name` | `string` | Có | Trim, không rỗng | Không trùng tên kho **chưa xoá** |
| `code` | `string` | Có | Trim, regex `^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$`: 2-32 ký tự chữ/số/gạch ngang, không bắt đầu hay kết thúc bằng `-` (`warehouse.constants.ts:9`) | Lưu dạng viết HOA. Không trùng với **mọi** kho, kể cả kho đã xoá |
| `address` | `string` | Có | Trim, không rỗng | |
| `phonenumber` | `string` | Không | Trim, regex `^0\d{8,10}$` (`warehouse.constants.ts:3`) | Gửi `""` sẽ lỗi `WAREHOUSE_PHONENUMBER_INVALID` |
| `description` | `string` | Không | Không trim, không kiểm tra kiểu | |
| `isActive` | `boolean` | Không | `true`/`false` hoặc chuỗi `"true"`/`"false"` | Mặc định `true` |

- **Response 201:** `result` là `WarehouseResponseDto`. Kho mới chưa có `manager`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100502 `WAREHOUSE_NAME_IS_REQUIRED` | Thiếu hoặc rỗng `name` |
| 400 | 100504 `WAREHOUSE_CODE_IS_REQUIRED` / 100505 `WAREHOUSE_CODE_INVALID` | Thiếu, rỗng hoặc sai format `code`. Khi `code` rỗng, cả hai ràng buộc cùng fail; mã nào được trả phụ thuộc thứ tự lỗi của class-validator (chưa xác minh) |
| 400 | 100508 `WAREHOUSE_ADDRESS_IS_REQUIRED` | Thiếu hoặc rỗng `address` |
| 400 | 100509 `WAREHOUSE_PHONENUMBER_INVALID` | `phonenumber` sai format |
| 400 | 100510 `WAREHOUSE_IS_ACTIVE_INVALID` | `isActive` không phải boolean |
| 422 | 100506 `WAREHOUSE_CODE_DOES_EXIST` | `code` trùng kho đang tồn tại (so sau khi viết HOA) (`warehouse.service.ts:369-380`) |
| 422 | 100507 `WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE` | `code` trùng kho đã xoá mềm |
| 422 | 100503 `WAREHOUSE_NAME_DOES_EXIST` | `name` trùng kho chưa xoá (`warehouse.service.ts:382-385`). Có phân biệt hoa/thường hay không tuỳ collation MySQL (chưa xác minh) |

Thứ tự kiểm tra trong service: `code` trước, rồi `name` (`warehouse.service.ts:85-86`).

## GET /api/v1/warehouses

- **Quyền:** `WAREHOUSE_READ`. Có giới hạn phạm vi kho (`warehouse.controller.ts:63-85`, `warehouse.service.ts:99-121`):
  - `ADMIN`/`SUPER_ADMIN`: thấy mọi kho, dùng được mọi filter.
  - Role khác: chỉ thấy kho mình là manager hoặc thành viên. `managerSlug` và `hasManager` **bị bỏ qua** (vẫn được validate).
- **Query:** `GetAllWarehouseRequestDto` (`warehouse.dto.ts:108-126`), kế thừa `BaseQueryDto` (xem [conventions.md](conventions.md)).

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `page`, `size` | `number` | Không | Xem conventions | Có tác dụng |
| `sort`, `startDate`, `endDate` | | Không | Được validate | **Bị bỏ qua**: service luôn sắp `createdAt DESC` và không lọc theo ngày (`warehouse.service.ts:331-341`) |
| `isActive` | `boolean` | Không | `"true"`/`"false"` | Lọc theo trạng thái |
| `managerSlug` | `string` | Không | Không validate | Chỉ ADMIN/SUPER_ADMIN. Lọc kho có manager mang slug này |
| `hasManager` | `boolean` | Không | `"true"`/`"false"` | Chỉ ADMIN/SUPER_ADMIN. Bị bỏ qua nếu có `managerSlug` |

- **Response 200:** `result` là trang phân trang của `WarehouseResponseDto`, sắp `createdAt` giảm dần. Không gồm kho đã xoá mềm.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100510 `WAREHOUSE_IS_ACTIVE_INVALID` | `isActive` không phải boolean |
| 400 | 100511 `WAREHOUSE_HAS_MANAGER_INVALID` | `hasManager` không phải boolean |

## GET /api/v1/warehouses/:slug

- **Quyền:** `WAREHOUSE_READ`. `ADMIN`/`SUPER_ADMIN` đọc được mọi kho. Role khác phải là manager hoặc thành viên của kho (`warehouse.service.ts:139-148`, `:355-363`).
- **Path params:** `slug` (`string`): slug kho.
- **Response 200:** `result` là `WarehouseResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho với slug này, hoặc kho đã xoá mềm |
| 403 | 100523 `WAREHOUSE_ACCESS_DENIED` | User dưới ADMIN không phải manager hay thành viên của kho. Kiểm tra sau khi tìm thấy kho, nên kho không tồn tại luôn trả 404 |

## PATCH /api/v1/warehouses/:slug

- **Quyền:** `WAREHOUSE_UPDATE`. Không kiểm tra phạm vi kho (`warehouse.controller.ts:134-156`).
- **Path params:** `slug` (`string`).
- **Body:** `UpdateWarehouseRequestDto` (`warehouse.dto.ts:62-73`). Mọi field của `POST` đều thành không bắt buộc, cùng ràng buộc khi có gửi.
  - Field không gửi thì giữ nguyên.
  - Field gửi `null` cũng bị bỏ qua, giá trị cũ được giữ (`pickDefined`, `src/shared/utils/obj.util.ts`). Hệ quả: **không xoá được** `phonenumber` hay `description` về rỗng bằng `null`. Gửi `description: ""` thì được. Gửi `phonenumber: ""` sẽ lỗi `WAREHOUSE_PHONENUMBER_INVALID`.
  - `isActive` không gửi thì giữ nguyên (không bị reset về `true`).
- **Response 200:** `result` là `WarehouseResponseDto` sau khi sửa.
- **Lỗi riêng:** như `POST` (trừ lỗi "thiếu field"), cộng thêm:

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 400 | 100502 / 100504 / 100508 | Gửi `name`/`code`/`address` là chuỗi rỗng (sau trim) |
| 422 | 100506 / 100507 / 100503 | `code`/`name` mới trùng. Chỉ kiểm tra khi giá trị thật sự đổi (`warehouse.service.ts:196-200`) |

Không có optimistic lock (`version`) trên kho.

## PUT /api/v1/warehouses/:slug/manager

- **Quyền:** `WAREHOUSE_ASSIGN_MANAGER`. Không kiểm tra phạm vi kho (`warehouse.controller.ts:160-182`).
- **Path params:** `slug` (`string`).
- **Body:** `AssignWarehouseManagerRequestDto` (`warehouse.dto.ts:75-86`).

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `managerSlug` | `string \| null` | Có (phải có key) | Không rỗng nếu là chuỗi. Không trim | `null` để gỡ quản lý |

- **Điều kiện với user được gán** (`warehouse.service.ts:391-402`): tồn tại (chưa xoá mềm), đang hoạt động, có role `MANAGER`.
- Không chặn: một MANAGER quản lý nhiều kho; user vừa là manager vừa là thành viên của cùng kho.
- **Response 200:** `result` là `WarehouseResponseDto` (có `manager` mới, hoặc không có field `manager` nếu gỡ).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100513 `WAREHOUSE_MANAGER_SLUG_IS_REQUIRED` | Không có key `managerSlug`, hoặc là `""` |
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 404 | 100514 `WAREHOUSE_MANAGER_NOT_FOUND` | Không có user với slug này |
| 422 | 100515 `WAREHOUSE_MANAGER_INACTIVE` | User bị khoá |
| 422 | 100516 `WAREHOUSE_MANAGER_ROLE_INVALID` | User không có role `MANAGER` |

## PUT /api/v1/warehouses/:slug/members

- **Quyền:** `WAREHOUSE_UPDATE` **và** `USER_READ`. Không kiểm tra phạm vi kho (`warehouse.controller.ts:187-214`).
- **Path params:** `slug` (`string`).
- **Body:** `AssignWarehouseMemberRequestDto` (`warehouse.dto.ts:88-96`).

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `userSlug` | `string` | Có | Trim, không rỗng | Slug user cần gán |

- **Hành vi** (`warehouse.service.ts:238-268`):
  - Idempotent: user đã là thành viên thì trả 200 với row hiện có, không báo lỗi.
  - User từng bị gỡ: khôi phục row cũ (giữ `slug` và `createdAt` cũ của row).
  - Không chặn việc gán chính manager của kho làm thành viên.
- **Response 200:** `result` là `WarehouseMemberResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100518 `WAREHOUSE_MEMBER_USER_SLUG_IS_REQUIRED` | Thiếu hoặc rỗng `userSlug` |
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 404 | 100519 `WAREHOUSE_MEMBER_USER_NOT_FOUND` | Không có user |
| 422 | 100520 `WAREHOUSE_MEMBER_USER_INACTIVE` | User bị khoá |
| 422 | 100524 `WAREHOUSE_MEMBER_USER_IS_ADMIN` | User có role `ADMIN` hoặc `SUPER_ADMIN` (`warehouse.constants.ts:28`) |

## GET /api/v1/warehouses/:slug/members

- **Quyền:** `WAREHOUSE_READ` (không cần `USER_READ`). Phạm vi giống `GET /warehouses/:slug` (`warehouse.controller.ts:218-243`, `warehouse.service.ts:155-180`).
- **Path params:** `slug` (`string`).
- **Query:** `BaseQueryDto`. `page`, `size` có tác dụng. `sort`, `startDate`, `endDate` được validate nhưng **bị bỏ qua** (luôn `createdAt DESC`).
- **Response 200:** trang phân trang của `WarehouseMemberResponseDto`, mới gán trước.
  - **Không** gồm manager của kho (xem `manager` ở `GET /warehouses/:slug`).
  - Không gồm thành viên đã gỡ.
  - Gồm cả user đang bị khoá (service không lọc `isActive`).
  - Nếu user của row đã bị xoá mềm, `user` có thể thiếu (chưa xác minh).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 403 | 100523 `WAREHOUSE_ACCESS_DENIED` | User dưới ADMIN không thuộc kho |

## GET /api/v1/warehouses/:slug/available-members

- **Quyền:** `WAREHOUSE_UPDATE` **và** `USER_READ`. Không kiểm tra phạm vi kho (`warehouse.controller.ts:246-269`).
- **Path params:** `slug` (`string`).
- **Query:** `GetAvailableWarehouseMemberRequestDto` = query của `GET /users` **bỏ** `warehouseSlug` (`warehouse.dto.ts:184-186`). Gồm `page`, `size`, `sort`, `startDate`, `endDate`, `roleSlug`, `name`, `phonenumber`, `birthday`, `isActive`, `sortBy`. Ý nghĩa và lỗi validate từng field xem `GET /api/v1/users` ở [users-rbac.md](users-rbac.md).
  - Gửi `warehouseSlug` sẽ bị bỏ (whitelist).
  - `isActive` **luôn bị ép thành `true`**, client gửi `false` cũng không có tác dụng (`src/user/user.service.ts:138-141`).
  - Ở endpoint này `GET /users` được gọi **không kèm** user hiện tại, nên không giới hạn "user chung kho" như khi gọi `GET /users` trực tiếp (`warehouse.service.ts:292-296`).
- **Lọc cố định** (`warehouse.service.ts:275-297`): chỉ user đang hoạt động, chưa là thành viên kho (user đã bị gỡ vẫn được tính là gán được), không phải manager hiện tại của kho, không có role `ADMIN`/`SUPER_ADMIN`.
- **Response 200:** trang phân trang của `UserResponseDto` (giống `GET /users`, có cả `role` và `warehouses`). Xem [users-rbac.md](users-rbac.md).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| (xem users-rbac.md) | `USER_BIRTHDAY_INVALID`, `USER_IS_ACTIVE_INVALID`, `SORT_BY_INVALID` | Query sai format |

## DELETE /api/v1/warehouses/:slug/members/:userSlug

- **Quyền:** `WAREHOUSE_UPDATE` **và** `USER_READ`. Không kiểm tra phạm vi kho (`warehouse.controller.ts:271-286`).
- **Path params:** `slug` (`string`): slug kho. `userSlug` (`string`): slug **user** (không phải slug row thành viên).
- **Hành vi:** xoá mềm row thành viên. User bị khoá vẫn gỡ được (`warehouse.service.ts:303-316`).
- **Response 200:** `result` là chuỗi `"1 warehouse member have been removed successfully"`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 404 | 100522 `WAREHOUSE_MEMBER_NOT_FOUND` | User không phải thành viên (hoặc đã bị gỡ), hoặc user không tồn tại |

Gỡ manager phải dùng `PUT /warehouses/:slug/manager` với `managerSlug: null`. Endpoint này không gỡ manager.

## DELETE /api/v1/warehouses/:slug

- **Quyền:** `WAREHOUSE_DELETE` (`warehouse.controller.ts:288-302`).
- **Path params:** `slug` (`string`).
- **Hành vi:** xoá mềm. Kho phải đang `isActive = false` (`warehouse.service.ts:318-329`). Service **không** kiểm tra tồn kho, phiếu, cửa hàng đang gắn hay thành viên còn lại.
- Sau khi xoá: `name` dùng lại được cho kho mới. `code` thì **không**, sẽ bị `WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE`.
- **Response 200:** `result` là chuỗi `"1 warehouse have been deleted successfully"`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100501 `WAREHOUSE_NOT_FOUND` | Không có kho |
| 422 | 100517 `WAREHOUSE_ACTIVE_CANNOT_BE_DELETED` | Kho đang hoạt động. Cần `PATCH` `isActive: false` trước |

## Mã lỗi của module

Nguồn: `src/warehouse/warehouse.validation.ts:56-144` (`WarehouseValidation`, dải 1005xx). HTTP mặc định của `createErrorCode` là 422 (`src/app/error-code.util.ts`).

| Key | code | HTTP | message |
|---|---|---|---|
| `WAREHOUSE_NOT_FOUND` | 100501 | 404 | Warehouse not found |
| `WAREHOUSE_NAME_IS_REQUIRED` | 100502 | 400 | Warehouse name is required |
| `WAREHOUSE_NAME_DOES_EXIST` | 100503 | 422 | Warehouse name does exist |
| `WAREHOUSE_CODE_IS_REQUIRED` | 100504 | 400 | Warehouse code is required |
| `WAREHOUSE_CODE_INVALID` | 100505 | 400 | Warehouse code must be 2-32 characters of letters, digits or hyphen (e.g. WH-HN-01) |
| `WAREHOUSE_CODE_DOES_EXIST` | 100506 | 422 | Warehouse code does exist |
| `WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE` | 100507 | 422 | Warehouse code is still held by a deleted warehouse |
| `WAREHOUSE_ADDRESS_IS_REQUIRED` | 100508 | 400 | Warehouse address is required |
| `WAREHOUSE_PHONENUMBER_INVALID` | 100509 | 400 | Warehouse phone number is invalid |
| `WAREHOUSE_IS_ACTIVE_INVALID` | 100510 | 400 | isActive must be a boolean |
| `WAREHOUSE_HAS_MANAGER_INVALID` | 100511 | 400 | hasManager must be a boolean |
| `WAREHOUSE_MANAGER_SLUG_IS_REQUIRED` | 100513 | 400 | managerSlug is required - send null to unassign the manager |
| `WAREHOUSE_MANAGER_NOT_FOUND` | 100514 | 404 | Manager user not found |
| `WAREHOUSE_MANAGER_INACTIVE` | 100515 | 422 | Manager user is inactive |
| `WAREHOUSE_MANAGER_ROLE_INVALID` | 100516 | 422 | Assigned manager must be a user with the MANAGER role |
| `WAREHOUSE_ACTIVE_CANNOT_BE_DELETED` | 100517 | 422 | Deactivate the warehouse before deleting it |
| `WAREHOUSE_MEMBER_USER_SLUG_IS_REQUIRED` | 100518 | 400 | userSlug is required |
| `WAREHOUSE_MEMBER_USER_NOT_FOUND` | 100519 | 404 | Member user not found |
| `WAREHOUSE_MEMBER_USER_INACTIVE` | 100520 | 422 | Member user is inactive |
| `WAREHOUSE_MEMBER_NOT_FOUND` | 100522 | 404 | User is not a member of this warehouse |
| `WAREHOUSE_ACCESS_DENIED` | 100523 | 403 | You are not a manager or member of this warehouse |
| `WAREHOUSE_MEMBER_USER_IS_ADMIN` | 100524 | 422 | User is an admin and cannot be assigned as a warehouse member |

Mã 100512 và 100521 không có trong code hiện tại.

Module khác cũng trả mã của module này: `WAREHOUSE_NOT_FOUND` từ inventory, store, import/export form; `WAREHOUSE_ACCESS_DENIED` từ `WarehouseScopeGuard`.

## Ghi chú cho FE

- **Định danh:** mọi path dùng `slug`. Response không bao giờ có `id`.
- **Hai loại "người của kho":** manager là một slot riêng trên kho (field `manager`), thành viên nằm ở `GET .../members`. Danh sách thành viên không gồm manager. Một user có thể vừa là manager vừa là thành viên.
- **Xoá mềm:** kho đã xoá không xuất hiện ở đâu và trả 404. `code` của kho đã xoá vẫn bị giữ.
- **Kho ngừng hoạt động** (`isActive = false`) vẫn đọc và sửa được qua module này. Module khác có chặn riêng, ví dụ inventory chặn gán vật tư (`INVENTORY_WAREHOUSE_INACTIVE`), store chặn gắn kho (`STORE_WAREHOUSE_INACTIVE`).
- **Phân trang:** `sort`/`startDate`/`endDate` không có tác dụng ở `GET /warehouses` và `GET .../members`.
- **Không có optimistic lock** (`version`) trên kho và thành viên kho.
- **Response của `DELETE`** là một chuỗi tiếng Anh trong `result`, không phải object.

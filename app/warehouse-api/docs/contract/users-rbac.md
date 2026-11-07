# User và RBAC (user, role, authority, authority group, permission)

> Nguồn: `src/user/user.controller.ts`, `src/user/user.service.ts`, `src/user/user.dto.ts`, `src/user/user.mapper.ts`, `src/user/user.validation.ts`, `src/user/user.constants.ts`, `src/role/role.controller.ts`, `src/role/role.service.ts`, `src/role/role.dto.ts`, `src/role/role.mapper.ts`, `src/role/role.validation.ts`, `src/role/role.enum.ts`, `src/authority/authority.controller.ts`, `src/authority/authority.service.ts`, `src/authority/authority.dto.ts`, `src/authority/authority.validation.ts`, `src/authority/authority.constants.ts`, `src/authority-group/*`, `src/permission/permission.controller.ts`, `src/permission/permission.service.ts`, `src/migrations/*seed*` (đường dẫn tương đối từ `app/warehouse-api`).
> Base URL: `/api/v1` (quy ước chung: [conventions.md](conventions.md)).

## Tóm tắt endpoint

| Method | Path | Quyền (authority / role) | Mô tả |
|---|---|---|---|
| POST | /api/v1/users | `USER_CREATE` | Tạo user |
| GET | /api/v1/users | `USER_READ` | Danh sách user (phân trang, lọc) |
| GET | /api/v1/users/:userSlug | `USER_READ` | Chi tiết user |
| POST | /api/v1/users/:userSlug/change-password | `USER_CHANGE_PASSWORD`, 10 req/phút/IP | Đổi mật khẩu hộ user khác |
| PATCH | /api/v1/users/:userSlug | `USER_UPDATE` | Sửa hồ sơ (partial) |
| PUT | /api/v1/users/:userSlug/lock | `USER_UPDATE` | Khoá tài khoản |
| PUT | /api/v1/users/:userSlug/unlock | `USER_UPDATE` | Mở khoá tài khoản |
| DELETE | /api/v1/users/:userSlug | `USER_DELETE` | Xoá mềm user |
| POST | /api/v1/users/:userSlug/change-role | `USER_UPDATE` | Đổi role của user khác |
| GET | /api/v1/roles | `ROLE_READ` | Danh sách role, kèm `authorityCodes` |
| GET | /api/v1/roles/:slug | `ROLE_READ` | Chi tiết role, kèm `authorityCodes` |
| POST | /api/v1/roles | `ROLE_CREATE` | Tạo role |
| PATCH | /api/v1/roles/:slug | `ROLE_UPDATE` | Sửa mô tả role |
| DELETE | /api/v1/roles/:slug | `ROLE_DELETE` | Xoá mềm role |
| GET | /api/v1/authorities | Đã đăng nhập | Danh sách authority |
| PATCH | /api/v1/authorities/:slug | `MANAGE_PERMISSIONS` | Sửa tên hiển thị hoặc nhóm của authority |
| GET | /api/v1/authority-groups | Đã đăng nhập | Danh sách nhóm authority |
| PUT | /api/v1/roles/:roleSlug/authorities/:authorityCode | `MANAGE_PERMISSIONS` | Cấp 1 authority cho role |
| DELETE | /api/v1/roles/:roleSlug/authorities/:authorityCode | `MANAGE_PERMISSIONS` | Thu hồi 1 authority khỏi role và mọi role cấp thấp hơn |

Mọi endpoint ở đây cần access token. `SUPER_ADMIN` bỏ qua `@RequireAuthority`. Không endpoint nào dùng `@WarehouseScope`, `@HasRole` hay `@Feature`.

## Thứ bậc role (áp dụng cho mọi thao tác quản trị)

- Mỗi role có `level` (số nguyên, càng lớn càng cao cấp). Seed (`src/migrations/1783728000028-add-level-to-role.ts`): `SUPERVISOR` 10, `MANAGER` 20, `ADMIN` 30, `SUPER_ADMIN` 100. 4 tên này là role dựng sẵn (`src/role/role.enum.ts`).
- `RoleService.assertCanManage` (`src/role/role.service.ts`): chỉ được tạo, gán, sửa, xoá, cấp quyền cho role có `level` **thấp hơn hẳn** role của mình. Ngang cấp cũng bị chặn. Vi phạm trả 403 `ROLE_LEVEL_FORBIDDEN` (100104).
- `SUPER_ADMIN` có cấp vô hạn và qua mọi kiểm tra cấp. Nếu token không có claim `role`, hoặc role của người gọi đã bị xoá, người gọi không quản lý được ai (100104).
- Riêng thao tác trên user khác (sửa, khoá, mở khoá, xoá, đổi role): `ADMIN` đụng vào `ADMIN` khác sẽ bị 403 `ADMIN_CANNOT_MANAGE_ADMIN` (100417). Lỗi này được kiểm tra trước lỗi cấp.

### Dạng `UserResponseDto`

Nguồn: `src/user/user.dto.ts`, `src/user/user.mapper.ts`.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug` | `string (slug)` | Định danh public |
| `createdAt`, `updatedAt` | `string` | Dạng `Date.toString()`, không phải ISO ([conventions.md §3](conventions.md#3-response-thành-công)) |
| `phonenumber` | `string` | |
| `firstName`, `lastName` | `string` | |
| `dob` | `string (YYYY-MM-DD)?` | Cột DATE |
| `email` | `string?` | |
| `address` | `string?` | |
| `isActive` | `boolean` | `false` = đang bị khoá |
| `roleSlug` | `string` | |
| `roleName` | `string` | |
| `role` | `{ slug, name, description?, level }?` | Vắng mặt nếu user không có role |
| `warehouses` | `Array<{ slug, code, name }>?` | Kho mà user là **member** (không gồm kho user làm manager). **Chỉ có** ở `GET /users` và `GET /users/:userSlug` (và `GET /warehouses/:slug/available-members`, xem [warehouse.md](warehouse.md)). Các endpoint ghi không trả field này |

Cột nullable (`dob`, `email`, `address`) trả `null` hay vắng mặt thì **chưa xác minh**.

## POST /api/v1/users

- **Quyền:** `USER_CREATE`. Role được gán phải có cấp thấp hơn role của người gọi.
- **Body:** `CreateUserRequestDto`

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `phonenumber` | `string` | có | Trim, rồi khớp `^0[35789][0-9]{8}$` (`src/user/user.constants.ts`) | Số di động Việt Nam 10 chữ số |
| `firstName` | `string` | có | Trim, không rỗng | |
| `lastName` | `string` | có | Trim, không rỗng | |
| `dob` | `string` | không | Đúng dạng `YYYY-MM-DD` và là ngày hợp lệ | Không gửi `""` |
| `email` | `string` | không | Trim, `@IsEmail` | Không gửi `""` |
| `address` | `string` | không | Trim | |
| `password` | `string` | có | Không rỗng. Không có quy tắc độ dài | |
| `roleSlug` | `string` | có | Không rỗng | Slug của role cần gán |

- **Response 201:** `result` có dạng `UserResponseDto` (không có `warehouses`).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100402 `USER_PHONENUMBER_IS_REQUIRED` | Thiếu hoặc rỗng `phonenumber` |
| 400 | 100409 `USER_PHONENUMBER_INVALID` | Sai định dạng số điện thoại |
| 400 | 100410 `USER_FIRST_NAME_IS_REQUIRED` | |
| 400 | 100411 `USER_LAST_NAME_IS_REQUIRED` | |
| 400 | 100412 `USER_DOB_INVALID` | |
| 400 | 100413 `USER_EMAIL_INVALID` | |
| 400 | 100403 `USER_PASSWORD_IS_REQUIRED` | |
| 400 | 100404 `USER_ROLE_SLUG_IS_REQUIRED` | |
| 422 | 100401 `USER_PHONENUMBER_DOES_EXIST` | Số điện thoại đã thuộc user đang tồn tại |
| 422 | 100419 `USER_PHONENUMBER_RESERVED_BY_DELETED_USER` | Số điện thoại vẫn bị user đã xoá mềm giữ |
| 422 | 100101 `ROLE_NOT_FOUND` | `roleSlug` không tồn tại |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | Role được gán có cấp ≥ cấp của người gọi |

## GET /api/v1/users

- **Quyền:** `USER_READ`. Danh sách bị **lọc theo phạm vi kho**:
  - `ADMIN`/`SUPER_ADMIN` thấy mọi user.
  - Role khác (kể cả `MANAGER`, role tự tạo, token không có claim `role`) chỉ thấy các user là manager hoặc member của ít nhất 1 kho mà người gọi cũng là manager hoặc member. Người gọi không thuộc kho nào sẽ nhận danh sách rỗng (`UserService.findAll`, `findUserIdsSharingWarehouse`).
- **Query:** `GetAllUserRequestDto` = `BaseQueryDto` ([conventions.md §4](conventions.md#4-phân-trang-sắp-xếp-lọc-theo-ngày-tạo)) cộng các field sau:

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `roleSlug` | `string` | không | — | Lọc đúng role |
| `name` | `string` | không | Trim | Chứa chuỗi (substring) trong `firstName`, `lastName`, hoặc `"lastName firstName"` |
| `phonenumber` | `string` | không | Trim | Chứa chuỗi trong `phonenumber` |
| `warehouseSlug` | `string` | không | — | Chỉ user là **member** của kho này (không gồm manager). Slug không tồn tại thì ra danh sách rỗng |
| `birthday` | `string` | không | `YYYY-MM-DD` | Khớp đúng `dob` |
| `isActive` | `'true' \| 'false'` | không | Boolean | `true` = đang hoạt động, `false` = bị khoá |
| `sortBy` | `'createdAt' \| 'name' \| 'dob'` | không | Enum `UserSortBy` | Mặc định `createdAt`. `name` = sắp theo `lastName` rồi `firstName` |

- **Response 200:** `result` có dạng `AppPaginatedResponseDto<UserResponseDto>`. Mỗi item **có** `role` và `warehouses`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100422 `USER_DATE_RANGE_INVALID` | Sau khi quy đổi theo [conventions.md §4](conventions.md#4-phân-trang-sắp-xếp-lọc-theo-ngày-tạo), `startDate` ≥ `endDate` |
| 400 | 100423 `USER_BIRTHDAY_INVALID` | `birthday` sai dạng |
| 400 | 100425 `USER_IS_ACTIVE_INVALID` | `isActive` khác `true`/`false` |
| 422 | 100853 `SORT_BY_INVALID` | `sortBy` ngoài enum |

## GET /api/v1/users/:userSlug

- **Quyền:** `USER_READ`. Cùng phạm vi kho với `GET /users`, và luôn xem được chính mình. User ngoài phạm vi trả `USER_NOT_FOUND`, không lộ việc user đó có tồn tại hay không.
- **Path params:** `userSlug`: `string (slug)`.
- **Response 200:** `result` có dạng `UserResponseDto`, **có** `role` và `warehouses`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100405 `USER_NOT_FOUND` | Không tồn tại, đã xoá, hoặc nằm ngoài phạm vi kho |

## POST /api/v1/users/:userSlug/change-password

- **Quyền:** `USER_CHANGE_PASSWORD`. `@Throttle` 10 req / 60 giây / IP.
  - Không được nhắm vào chính mình: đổi mật khẩu của mình thì dùng `POST /api/v1/auth/change-password`.
  - Người gọi khác `SUPER_ADMIN` không đổi được mật khẩu của `SUPER_ADMIN`, cũng không đổi được của user có cấp **cao hơn** mình. Ngang cấp thì **được**.
  - Không áp warehouse scope.
- **Path params:** `userSlug`: `string (slug)`.
- **Body:** `ChangeUserPasswordRequestDto`

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `newPassword` | `string` | có | Không rỗng | Không có quy tắc độ dài |

- **Response 200:** `result` = `{ "userSlug": string }`. Mọi phiên của user bị đổi mật khẩu bị thu hồi. Token của người gọi không bị ảnh hưởng.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100406 `USER_NEW_PASSWORD_IS_REQUIRED` | |
| 404 | 100405 `USER_NOT_FOUND` | |
| 400 | 100408 `CHANGE_OWN_PASSWORD_NOT_ALLOWED` | `userSlug` là chính người gọi |
| 403 | 100407 `CHANGE_PASSWORD_FORBIDDEN` | Đích là `SUPER_ADMIN`, hoặc đích có cấp cao hơn người gọi |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | Không xác định được cấp của người gọi (token không có `role`, hoặc role đã bị xoá) |
| 429 | — | Vượt 10 req/phút |

## PATCH /api/v1/users/:userSlug

- **Quyền:** `USER_UPDATE`. Sửa chính mình thì luôn được. Sửa user khác thì role của họ phải có cấp thấp hơn người gọi, và `ADMIN` không sửa được `ADMIN` khác. **Không** áp phạm vi kho.
- **Path params:** `userSlug`: `string (slug)`.
- **Body:** `UpdateUserRequestDto` = các field hồ sơ của `POST /users`, **tất cả tuỳ chọn**: `phonenumber`, `firstName`, `lastName`, `dob`, `email`, `address`. Ràng buộc giống khi tạo. **Không** có `password`, `roleSlug`, `isActive`; nếu gửi các field này thì bị bỏ âm thầm.
  - Field vắng mặt hoặc `null`: giữ nguyên giá trị cũ (`pickDefined`, `src/shared/utils/obj.util.ts`). Vì vậy **không xoá được** `email`/`dob`/`address` về rỗng. Gửi `""` cho `email`/`dob` sẽ lỗi validation.
- **Response 200:** `result` có dạng `UserResponseDto` (không có `warehouses`).
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100409, 100410, 100411, 100412, 100413 | Validation như khi tạo. `phonenumber: ""` trả 100402 |
| 404 | 100405 `USER_NOT_FOUND` | |
| 403 | 100417 `ADMIN_CANNOT_MANAGE_ADMIN` | Người gọi `ADMIN` sửa user `ADMIN` khác |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | Đích có cấp ≥ người gọi |
| 422 | 100401 `USER_PHONENUMBER_DOES_EXIST` | Đổi sang số đã có người dùng |
| 422 | 100419 `USER_PHONENUMBER_RESERVED_BY_DELETED_USER` | Đổi sang số đang bị user đã xoá giữ |

## PUT /api/v1/users/:userSlug/lock

- **Quyền:** `USER_UPDATE`. Không khoá được chính mình, user có cấp ≥ mình (`ADMIN` không khoá được `ADMIN`), hoặc user đang là **manager của kho** nào đó. Muốn khoá manager kho thì phải đổi manager kho trước.
- **Path params:** `userSlug`: `string (slug)`.
- **Body:** không có.
- **Response 200:** `result` có dạng `UserResponseDto` với `isActive: false`. Idempotent: khoá lại user đã khoá vẫn trả 200. Mọi phiên của user bị thu hồi.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100405 `USER_NOT_FOUND` | |
| 400 | 100414 `LOCK_OWN_ACCOUNT_NOT_ALLOWED` | |
| 403 | 100417 `ADMIN_CANNOT_MANAGE_ADMIN` | |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | |
| 409 | 100415 `USER_IS_WAREHOUSE_MANAGER` | User đang là manager của ít nhất 1 kho |

## PUT /api/v1/users/:userSlug/unlock

- **Quyền:** `USER_UPDATE`. Điều kiện cấp giống `lock`. Không kiểm tra "chính mình" hay "manager kho".
- **Path params:** `userSlug`: `string (slug)`.
- **Body:** không có.
- **Response 200:** `result` có dạng `UserResponseDto` với `isActive: true`. Idempotent. User phải đăng nhập lại.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100405 `USER_NOT_FOUND` | |
| 403 | 100417 `ADMIN_CANNOT_MANAGE_ADMIN` | |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | |

## DELETE /api/v1/users/:userSlug

- **Quyền:** `USER_DELETE`. Điều kiện giống `lock`.
- **Path params:** `userSlug`: `string (slug)`.
- **Response 200:** `result` = `"1 user have been deleted successfully"` (chuỗi).
  - Xoá mềm user và mọi dòng member kho của user trong 1 transaction, sau đó thu hồi mọi phiên của user.
  - Số điện thoại vẫn bị giữ: tạo lại user với số này sẽ nhận 100419.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 404 | 100405 `USER_NOT_FOUND` | |
| 400 | 100418 `DELETE_OWN_ACCOUNT_NOT_ALLOWED` | |
| 403 | 100417 `ADMIN_CANNOT_MANAGE_ADMIN` | |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | |
| 409 | 100415 `USER_IS_WAREHOUSE_MANAGER` | |

## POST /api/v1/users/:userSlug/change-role

- **Quyền:** `USER_UPDATE`. Không đổi được role của chính mình. Cả role **hiện tại** lẫn role **mới** của user đều phải có cấp thấp hơn người gọi.
- **Path params:** `userSlug`: `string (slug)`.
- **Body:** `ChangeUserRoleRequestDto`

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `roleSlug` | `string` | có | Không rỗng | Slug role mới |

- **Response 200:** `result` có dạng `UserResponseDto` (role mới). Nếu role thực sự thay đổi thì mọi phiên của user bị thu hồi. Gán lại đúng role cũ thì không làm gì.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100404 `USER_ROLE_SLUG_IS_REQUIRED` | |
| 404 | 100405 `USER_NOT_FOUND` | |
| 400 | 100416 `CHANGE_OWN_ROLE_NOT_ALLOWED` | |
| 403 | 100417 `ADMIN_CANNOT_MANAGE_ADMIN` | |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | Role hiện tại hoặc role mới có cấp ≥ người gọi |
| 422 | 100101 `ROLE_NOT_FOUND` | `roleSlug` không tồn tại |

## GET /api/v1/roles

- **Quyền:** `ROLE_READ`.
- **Response 200:** `result` có dạng `RoleResponseDto[]`, sắp theo `createdAt` tăng dần, không gồm role đã xoá mềm.

`RoleResponseDto` (`src/role/role.dto.ts`, `src/role/role.mapper.ts`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug`, `createdAt`, `updatedAt` | `string` | |
| `name` | `string` | vd `SUPERVISOR`, `MANAGER`, `ADMIN`, `SUPER_ADMIN`, hoặc tên role tự tạo |
| `level` | `number` | |
| `description` | `string?` | |
| `authorityCodes` | `string[]` | Các code authority đang cấp cho role. `SUPER_ADMIN` thường là `[]` vì role này bypass ở guard |

- **Lỗi riêng:** không có.

## GET /api/v1/roles/:slug

- **Quyền:** `ROLE_READ`.
- **Path params:** `slug`: `string (slug)`.
- **Response 200:** `result` có dạng `RoleResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 100101 `ROLE_NOT_FOUND` | Lưu ý là 422, không phải 404 |

## POST /api/v1/roles

- **Quyền:** `ROLE_CREATE`. `level` phải thấp hơn cấp của người gọi.
- **Body:** `CreateRoleRequestDto`

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `name` | `string` | có | `@IsNotEmpty`, `@IsString`. Không trim, không giới hạn định dạng | Không được trùng tên role nào, kể cả role đã xoá mềm |
| `level` | `number (int ≥ 1)` | có | `@IsInt`, `@Min(1)` | **Không có message riêng**: sai thì nhận 400 với message gốc của class-validator và **không có `code`** |
| `description` | `string` | không | `@IsString` (không có message riêng) | |

- **Response 201:** `result` có dạng `RoleResponseDto` với `authorityCodes: []`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 400 | 100103 `ROLE_NAME_IS_REQUIRED` | `name` rỗng hoặc không phải chuỗi |
| 400 | — | `level` không phải số nguyên hoặc < 1; `description` không phải chuỗi |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | `level` ≥ cấp của người gọi |
| 422 | 100102 `ROLE_NAME_ALREADY_EXISTS` | |

## PATCH /api/v1/roles/:slug

- **Quyền:** `ROLE_UPDATE`. Role đích phải có cấp thấp hơn người gọi.
- **Path params:** `slug`: `string (slug)`.
- **Body:** `UpdateRoleRequestDto`

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `description` | `string` | không | `@IsString` (không có message riêng) | Field duy nhất sửa được. `name` và `level` không đổi được |

- **Response 200:** `result` có dạng `RoleResponseDto`. **Lưu ý:** service load role mà không kèm permission, nên `authorityCodes` ở response này **luôn là `[]`**, kể cả khi role đang có quyền. Muốn biết quyền thật thì gọi `GET /roles/:slug`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 100101 `ROLE_NOT_FOUND` | |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | |
| 400 | — | `description` không phải chuỗi |

## DELETE /api/v1/roles/:slug

- **Quyền:** `ROLE_DELETE`. Role đích phải có cấp thấp hơn người gọi, không phải role dựng sẵn, và không còn user nào (kể cả user đã xoá mềm) mang role đó.
- **Path params:** `slug`: `string (slug)`.
- **Response 200:** `result` = `"1 role have been deleted successfully"`. Xoá mềm.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 100101 `ROLE_NOT_FOUND` | |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | |
| 422 | 100105 `ROLE_BUILT_IN_CANNOT_BE_DELETED` | `name` là một trong `SUPERVISOR`, `MANAGER`, `ADMIN`, `SUPER_ADMIN` |
| 422 | 100106 `ROLE_IN_USE` | Còn user mang role này |

## GET /api/v1/authorities

- **Quyền:** chỉ cần đăng nhập (không có `@RequireAuthority`).
- **Query:** `GetAllAuthorityRequestDto` = `BaseQueryDto` cộng các field sau:

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `authorityGroupSlug` | `string` | không | `@IsString` | Lọc theo nhóm. Slug không tồn tại thì ra `[]` |

  **Không phân trang:** `page`, `size`, `sort`, `startDate`, `endDate` vẫn bị validate (sai thì 422 100850–100855) nhưng bị bỏ qua khi truy vấn.
- **Response 200:** `result` có dạng `AuthorityResponseDto[]`, sắp theo `createdAt` tăng dần.

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug`, `createdAt`, `updatedAt` | `string` | |
| `name` | `string` | Tên hiển thị. Sửa được qua PATCH |
| `code` | `string` | Mã bất biến, dùng trong `@RequireAuthority` và trong `scope` |
| `authorityGroup` | `{ slug, createdAt, updatedAt, name }` | |

- **Lỗi riêng:** không có (ngoài lỗi query chung).

## PATCH /api/v1/authorities/:slug

- **Quyền:** `MANAGE_PERMISSIONS`.
- **Path params:** `slug`: `string (slug)` của authority (không phải `code`).
- **Body:** `UpdateAuthorityRequestDto`

| Tên | Kiểu | Bắt buộc | Ràng buộc | Ghi chú |
|---|---|---|---|---|
| `name` | `string` | không | `@IsString` (không có message riêng) | Chuỗi rỗng bị bỏ qua, không đổi |
| `authorityGroupSlug` | `string` | không | `@IsString` (không có message riêng) | Chuyển authority sang nhóm khác |

  `code` không sửa được.
- **Response 200:** `result` có dạng `AuthorityResponseDto`.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 100201 `AUTHORITY_NOT_FOUND` | |
| 422 | 100301 `AUTHORITY_GROUP_NOT_FOUND` | |
| 400 | — | Field không phải chuỗi |

## GET /api/v1/authority-groups

- **Quyền:** chỉ cần đăng nhập.
- **Response 200:** `result` = `Array<{ slug, createdAt, updatedAt, name }>`, sắp theo `createdAt` tăng dần.
- **Lỗi riêng:** không có.

## PUT /api/v1/roles/:roleSlug/authorities/:authorityCode

- **Quyền:** `MANAGE_PERMISSIONS`. Thêm các điều kiện sau (`src/permission/permission.service.ts`, `grant`):
  1. Role đích có cấp thấp hơn người gọi.
  2. Người gọi khác `SUPER_ADMIN` chỉ cấp được authority mà **role của chính mình đang có** (theo `scope`).
  3. Các authority **không uỷ quyền được** (`NON_DELEGABLE_AUTHORITY_CODES`: `MANAGE_PERMISSIONS`, `ROLE_CREATE`, `ROLE_UPDATE`, `ROLE_DELETE`) chỉ cấp được cho role `ADMIN`. Điều kiện này áp cả cho `SUPER_ADMIN`.
- **Path params:**

| Tên | Kiểu | Ghi chú |
|---|---|---|
| `roleSlug` | `string (slug)` | |
| `authorityCode` | `string` | `code` của authority (vd `USER_READ`), không phải slug |

- **Body:** không có.
- **Response 200:** `result` = `"OK"`. Idempotent: role đã có quyền thì vẫn trả 200. Có hiệu lực ở request kế tiếp của các user thuộc role.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 100101 `ROLE_NOT_FOUND` | |
| 422 | 100201 `AUTHORITY_NOT_FOUND` | |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | |
| 403 | 100202 `AUTHORITY_NOT_OWNED` | Người gọi không có authority này |
| 403 | 100203 `AUTHORITY_NOT_DELEGABLE` | Cấp authority không uỷ quyền được cho role khác `ADMIN` |

## DELETE /api/v1/roles/:roleSlug/authorities/:authorityCode

- **Quyền:** `MANAGE_PERMISSIONS`. Role đích có cấp thấp hơn người gọi. **Không** yêu cầu người gọi đang có authority đó.
- **Path params:** như PUT.
- **Response 200:** `result` = `"OK"`. Idempotent. **Thu hồi lan xuống:** role đích và **mọi role có `level` thấp hơn** đều mất authority này.
- **Lỗi riêng:**

| HTTP | code | Khi nào |
|---|---|---|
| 422 | 100101 `ROLE_NOT_FOUND` | |
| 422 | 100201 `AUTHORITY_NOT_FOUND` | |
| 403 | 100104 `ROLE_LEVEL_FORBIDDEN` | |

## Mã lỗi của module

### `UserValidation` (`src/user/user.validation.ts`)

| Key | code | HTTP | message |
|---|---|---|---|
| `USER_PHONENUMBER_DOES_EXIST` | 100401 | 422 | Phone number already exists |
| `USER_PHONENUMBER_IS_REQUIRED` | 100402 | 400 | Phone number is required |
| `USER_PASSWORD_IS_REQUIRED` | 100403 | 400 | Password is required |
| `USER_ROLE_SLUG_IS_REQUIRED` | 100404 | 400 | Role slug is required |
| `USER_NOT_FOUND` | 100405 | 404 | User not found |
| `USER_NEW_PASSWORD_IS_REQUIRED` | 100406 | 400 | New password is required |
| `CHANGE_PASSWORD_FORBIDDEN` | 100407 | 403 | You are not allowed to change the password of this user |
| `CHANGE_OWN_PASSWORD_NOT_ALLOWED` | 100408 | 400 | Use POST /auth/change-password to change your own password |
| `USER_PHONENUMBER_INVALID` | 100409 | 400 | Phone number must be a valid Vietnamese mobile number (e.g. 0900000000) |
| `USER_FIRST_NAME_IS_REQUIRED` | 100410 | 400 | First name is required |
| `USER_LAST_NAME_IS_REQUIRED` | 100411 | 400 | Last name is required |
| `USER_DOB_INVALID` | 100412 | 400 | Date of birth must be a valid date in YYYY-MM-DD format |
| `USER_EMAIL_INVALID` | 100413 | 400 | Email is invalid |
| `LOCK_OWN_ACCOUNT_NOT_ALLOWED` | 100414 | 400 | You cannot lock your own account |
| `USER_IS_WAREHOUSE_MANAGER` | 100415 | 409 | User is the manager of a warehouse — reassign the warehouse manager before locking or deleting |
| `CHANGE_OWN_ROLE_NOT_ALLOWED` | 100416 | 400 | You cannot change your own role |
| `ADMIN_CANNOT_MANAGE_ADMIN` | 100417 | 403 | An admin cannot modify or lock another admin account |
| `DELETE_OWN_ACCOUNT_NOT_ALLOWED` | 100418 | 400 | You cannot delete your own account |
| `USER_PHONENUMBER_RESERVED_BY_DELETED_USER` | 100419 | 422 | Phone number is still held by a deleted user |
| `USER_DATE_RANGE_INVALID` | 100422 | 400 | startDate must not be after endDate |
| `USER_BIRTHDAY_INVALID` | 100423 | 400 | birthday must be a valid date in YYYY-MM-DD format |
| `USER_IS_ACTIVE_INVALID` | 100425 | 400 | isActive must be true or false |

### `RoleValidation` (`src/role/role.validation.ts`)

| Key | code | HTTP | message |
|---|---|---|---|
| `ROLE_NOT_FOUND` | 100101 | 422 | Role not found |
| `ROLE_NAME_ALREADY_EXISTS` | 100102 | 422 | Role name already exists |
| `ROLE_NAME_IS_REQUIRED` | 100103 | 400 | Role name is required |
| `ROLE_LEVEL_FORBIDDEN` | 100104 | 403 | Cannot manage a role of equal or higher level |
| `ROLE_BUILT_IN_CANNOT_BE_DELETED` | 100105 | 422 | Built-in role cannot be deleted |
| `ROLE_IN_USE` | 100106 | 422 | Role is still assigned to users |

### `AuthorityValidation` (`src/authority/authority.validation.ts`)

| Key | code | HTTP | message |
|---|---|---|---|
| `AUTHORITY_NOT_FOUND` | 100201 | 422 | Authority not found |
| `AUTHORITY_NOT_OWNED` | 100202 | 403 | Cannot grant an authority your own role does not have |
| `AUTHORITY_NOT_DELEGABLE` | 100203 | 403 | This authority can only be granted to the ADMIN role |

### `AuthorityGroupValidation` (`src/authority-group/authority-group.validation.ts`)

| Key | code | HTTP | message |
|---|---|---|---|
| `AUTHORITY_GROUP_NOT_FOUND` | 100301 | 422 | Authority group not found |

## Danh sách mã authority

- Nguồn chuẩn của **mã**: hằng `AuthorityCode` trong `src/authority/authority.constants.ts`.
- Tên hiển thị, nhóm và role được cấp sẵn là **dữ liệu seed** trong migration. Sau khi migrate, giá trị thật nằm ở `authority_tbl`/`permission_tbl` và admin có thể sửa qua API. Cột "Cấp sẵn" chỉ là trạng thái ban đầu; quyền hiện tại của từng role phải lấy từ `GET /roles` (`authorityCodes`).
- `SUPER_ADMIN` không được cấp row nào nhưng bypass mọi kiểm tra.
- Cột "Dùng ở": các module trong `src/` có tham chiếu `AuthorityCode.<X>`, kết quả grep bỏ qua `*.spec.ts` và `migrations/`. **"— (chưa dùng)"** nghĩa là code đã seed nhưng chưa endpoint nào dùng ở `main`.

Viết tắt role: A = `ADMIN`, M = `MANAGER`, S = `SUPERVISOR`.

| Code | Nhóm (seed) | Tên hiển thị (seed) | Cấp sẵn | Migration | Dùng ở |
|---|---|---|---|---|---|
| `EXAMPLE_CREATE` | Example | Create example | A | 1783728000009 | example (mẫu, không dành cho FE) |
| `EXAMPLE_UPDATE` | Example | Update example | A | 1783728000009 | example |
| `EXAMPLE_DELETE` | Example | Delete example | A | 1783728000009 | example |
| `MANAGE_PERMISSIONS` | Permission Management | Manage permissions | A (chỉ ADMIN giữ được, 1783728000029) | 1783728000009 | authority, permission |
| `DB_BACKUP` | System | Backup database | A | 1783728000009 | db |
| `LOGGER_READ` | System | Read logs | A | 1783728000009 | logger |
| `USER_CREATE` | User Management | Create user | A | 1783728000010 | user |
| `USER_READ` | User Management | List user | A | 1783728000010 | user, warehouse |
| `USER_CHANGE_PASSWORD` | User Management | Change password of a user | A, M | 1783728000011 | user |
| `USER_UPDATE` | User Management | Update / lock user, change user role | A | 1783728000035 | user |
| `USER_DELETE` | User Management | Delete user | A | 1783728000038 | user |
| `IMPORT_FORM_CREATE` | Import Form | Tạo phiếu nhập kho | A, S | 1783728000012 | import-form |
| `IMPORT_FORM_READ` | Import Form | Xem phiếu nhập kho | A, M, S | 1783728000012 | import-form |
| `IMPORT_FORM_UPDATE_DRAFT` | Import Form | Sửa phiếu nhập kho nháp (mọi phiếu) | A | 1783728000012 | import-form |
| `IMPORT_FORM_UPDATE_DRAFT_OWN` | Import Form | Sửa phiếu nhập kho nháp của mình | S | 1783728000012 | import-form |
| `IMPORT_FORM_DELETE_DRAFT` | Import Form | Xoá phiếu nhập kho nháp (mọi phiếu) | A, M | 1783728000012 | import-form |
| `IMPORT_FORM_DELETE_DRAFT_OWN` | Import Form | Xoá phiếu nhập kho nháp của mình | S | 1783728000012 | import-form |
| `IMPORT_FORM_CONFIRM` | Import Form | Xác nhận phiếu nhập kho | A, M | 1783728000012 | import-form |
| `IMPORT_FORM_EXPORT` | Import Form | In/xuất file phiếu nhập kho | A, M, S | 1783728000012 | — (chưa dùng) |
| `EXPORT_FORM_CREATE` | Export Form | Tạo phiếu xuất kho | A, S | 1783728000012 | export-form |
| `EXPORT_FORM_READ` | Export Form | Xem phiếu xuất kho | A, M, S | 1783728000012 | export-form |
| `EXPORT_FORM_UPDATE_DRAFT` | Export Form | Sửa phiếu xuất kho nháp (mọi phiếu) | A | 1783728000012 | export-form |
| `EXPORT_FORM_UPDATE_DRAFT_OWN` | Export Form | Sửa phiếu xuất kho nháp của mình | S | 1783728000012 | export-form |
| `EXPORT_FORM_DELETE_DRAFT` | Export Form | Xoá phiếu xuất kho nháp (mọi phiếu) | A, M | 1783728000012 | export-form |
| `EXPORT_FORM_DELETE_DRAFT_OWN` | Export Form | Xoá phiếu xuất kho nháp của mình | S | 1783728000012 | export-form |
| `EXPORT_FORM_CONFIRM` | Export Form | Xác nhận phiếu xuất kho | A, M | 1783728000012 | export-form |
| `EXPORT_FORM_EXPORT` | Export Form | In/xuất file phiếu xuất kho | A, M, S | 1783728000012 | — (chưa dùng) |
| `EXPORT_FORM_APPROVE_DISPOSAL` | Export Form | Phê duyệt phiếu xuất hủy | A, M | 1783728000012 | export-form |
| `BALANCE_FORM_CREATE` | Balance Form | Tạo phiếu kiểm kho | A, S | 1783728000012 | — (chưa dùng) |
| `BALANCE_FORM_READ` | Balance Form | Xem mọi phiếu kiểm kho | A, M | 1783728000012 | — (chưa dùng) |
| `BALANCE_FORM_READ_ASSIGNED` | Balance Form | Xem phiếu kiểm kho được phân công | S | 1783728000012 | — (chưa dùng) |
| `BALANCE_FORM_RECORD_COUNT` | Balance Form | Nhập số liệu kiểm kho (mọi phiếu) | A | 1783728000012 | — (chưa dùng) |
| `BALANCE_FORM_RECORD_COUNT_ASSIGNED` | Balance Form | Nhập số liệu phiếu kiểm kho được phân công | S | 1783728000012 | — (chưa dùng) |
| `BALANCE_FORM_COMPLETE` | Balance Form | Hoàn thành kiểm kho (mọi phiếu) | A | 1783728000012 | — (chưa dùng) |
| `BALANCE_FORM_COMPLETE_ASSIGNED` | Balance Form | Hoàn thành phiếu kiểm kho được phân công | S | 1783728000012 | — (chưa dùng) |
| `BALANCE_FORM_APPROVE` | Balance Form | Phê duyệt phiếu kiểm kho | A, M | 1783728000012 | — (chưa dùng) |
| `WAREHOUSE_PAYMENT_CREATE` | Warehouse Payment | Tạo phiếu chi kho thủ công | A, M, S | 1783728000012 | — (chưa dùng) |
| `WAREHOUSE_PAYMENT_READ` | Warehouse Payment | Xem mọi phiếu chi kho | A, M | 1783728000012 | — (chưa dùng) |
| `WAREHOUSE_PAYMENT_READ_OWN` | Warehouse Payment | Xem phiếu chi kho của mình | S | 1783728000012 | — (chưa dùng) |
| `WAREHOUSE_PAYMENT_UPDATE_DRAFT` | Warehouse Payment | Sửa phiếu chi kho nháp (mọi phiếu) | A | 1783728000012 | — (chưa dùng) |
| `WAREHOUSE_PAYMENT_UPDATE_DRAFT_OWN` | Warehouse Payment | Sửa phiếu chi kho nháp của mình | S | 1783728000012 | — (chưa dùng) |
| `WAREHOUSE_PAYMENT_APPROVE` | Warehouse Payment | Phê duyệt phiếu chi kho | A, M | 1783728000012 | — (chưa dùng) |
| `WAREHOUSE_PAYMENT_EXPORT` | Warehouse Payment | In/xuất file phiếu chi kho | A, M, S | 1783728000012 | — (chưa dùng) |
| `WAREHOUSE_CREATE` | Warehouse | Tạo kho | A | 1783728000014 | warehouse |
| `WAREHOUSE_READ` | Warehouse | Xem danh sách/chi tiết kho | A, M, S | 1783728000014 | warehouse, inventory, material-batch, store |
| `WAREHOUSE_UPDATE` | Warehouse | Sửa thông tin kho | A | 1783728000014 | warehouse, inventory, store |
| `WAREHOUSE_DELETE` | Warehouse | Xoá kho | A | 1783728000014 | warehouse |
| `WAREHOUSE_ASSIGN_MANAGER` | Warehouse | Phân công quản lý kho | A | 1783728000014 | warehouse |
| `UNIT_CREATE` | Unit | Tạo đơn vị tính | A | 1783728000024 | unit |
| `UNIT_READ` | Unit | Xem đơn vị tính | A, M, S | 1783728000024 | unit, material |
| `UNIT_UPDATE` | Unit | Sửa đơn vị tính | A | 1783728000024 | unit, material |
| `UNIT_DELETE` | Unit | Xoá đơn vị tính | A | 1783728000024 | unit |
| `MATERIAL_CREATE` | Material | Tạo vật tư/loại vật tư | A | 1783728000025 | material, material-type, inventory |
| `MATERIAL_READ` | Material | Xem vật tư/loại vật tư | A, M, S | 1783728000025 | material, material-type, material-batch, inventory, supplier |
| `MATERIAL_UPDATE` | Material | Sửa vật tư/loại vật tư | A | 1783728000025 | material, material-type, inventory, supplier |
| `MATERIAL_DELETE` | Material | Xoá vật tư/loại vật tư | A | 1783728000025 | material, material-type |
| `STORE_CREATE` | Store | Tạo cửa hàng | A | 1783728000026 | store |
| `STORE_READ` | Store | Xem cửa hàng | A, M, S | 1783728000026 | store |
| `STORE_UPDATE` | Store | Sửa cửa hàng | A | 1783728000026 | store |
| `STORE_DELETE` | Store | Xoá cửa hàng | A | 1783728000026 | store |
| `TAX_PROFILE_READ` | Tax Profile | Xem/tra cứu hồ sơ mã số thuế | A, M, S | 1783728000027 | tax-profile |
| `TAX_PROFILE_UPDATE` | Tax Profile | Làm mới hồ sơ mã số thuế từ nguồn bên ngoài | A | 1783728000027 | tax-profile |
| `ROLE_CREATE` | Role | Tạo vai trò | A | 1783728000029 | role |
| `ROLE_READ` | Role | Xem vai trò | A | 1783728000029 | role |
| `ROLE_UPDATE` | Role | Sửa vai trò | A | 1783728000029 | role |
| `ROLE_DELETE` | Role | Xoá vai trò | A | 1783728000029 | role |
| `SUPPLIER_CREATE` | Supplier | Tạo nhà cung cấp | A | 1783728000032 | supplier |
| `SUPPLIER_READ` | Supplier | Xem nhà cung cấp và lịch sử giao dịch | A, M, S | 1783728000032 | supplier |
| `SUPPLIER_UPDATE` | Supplier | Sửa nhà cung cấp / ghi giao dịch nhà cung cấp | A | 1783728000032 | supplier, material |
| `SUPPLIER_DELETE` | Supplier | Xoá nhà cung cấp | A | 1783728000032 | supplier |
| `FILE_CREATE` | File | Tải file đính kèm lên | A, S | 1783728000047 | file |

Có 71 code (đếm theo `AuthorityCode`). Endpoint nào cần code nào xem ở file contract của module đó. Một số route nối 2 tài nguyên cần **đủ cả 2** code (AND), vd `MATERIAL_UPDATE` + `UNIT_UPDATE`.

Một số endpoint còn kiểm tra quyền **trong service** thay vì trên decorator: kiểu "có ít nhất 1 trong các code" hoặc "bản đầy đủ hoặc bản `_OWN`" (`src/authority/authority-check.util.ts`). Các trường hợp này được ghi trong file module tương ứng (import-form, export-form).

## Ghi chú cho FE

- **Ẩn/hiện chức năng:** dùng `scope` từ `GET /auth/me` và so với `code` ở bảng trên. `roleName === 'SUPER_ADMIN'` thì coi như có mọi quyền. Backend vẫn là chốt chặn cuối cùng: FE hiện nút sai thì vẫn nhận 403.
- **Có authority chưa chắc đã làm được:** endpoint còn có điều kiện cấp role, phạm vi kho, chính mình hay người khác. Ví dụ có `USER_UPDATE` nhưng sửa user cùng cấp vẫn nhận 403 (100104).
- **Role:** dùng `name` để nhận diện role dựng sẵn. Slug sinh ngẫu nhiên khác nhau giữa các DB. `level` dùng để lọc danh sách role được phép gán: role có `level` nhỏ hơn role của người dùng hiện tại, trừ `SUPER_ADMIN`.
- **Authority:** `PATCH /authorities/:slug` dùng **slug**, còn cấp/thu hồi quyền dùng **code** trên path.
- **`PATCH /roles/:slug` trả `authorityCodes: []`.** Đừng dùng response này để cập nhật danh sách quyền. Gọi lại `GET /roles/:slug`.
- **Sau khi cấp/thu hồi quyền:** user thuộc role đó bị ảnh hưởng ngay ở request kế tiếp. Thu hồi lan xuống mọi role cấp thấp hơn. FE nên tải lại `GET /roles` sau khi thu hồi.
- **`GET /users` với role không phải ADMIN** chỉ trả user chung kho. Người dùng chưa thuộc kho nào nhận danh sách rỗng.
- **`PATCH /users/:userSlug`** không xoá được `email/dob/address` về rỗng. Gửi `null` hoặc bỏ field thì giữ nguyên.
- **Xoá user** là xoá mềm. Số điện thoại vẫn bị giữ (100419).
- **`DELETE /users/:userSlug`** và **`DELETE /roles/:slug`** trả `result` là chuỗi, không phải object.
- Lỗi `level`/`description` của `POST/PATCH /roles` và field của `PATCH /authorities/:slug` **không có `code`** (400, message gốc của class-validator).

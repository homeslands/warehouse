# Plan: Tách module Role / Authority / AuthorityGroup / Permission

## Context

Feature `authority-permission` (đã code xong, xem `docs/specs/authority-permission.md`) hiện nhét cả 4 entity + 4 bộ controller/service vào chung 1 module `src/role/` — lệch với convention "1 entity = 1 module" mô tả trong `CLAUDE.md` (`Cấu trúc 1 module`, tham khảo `src/example/`). Tách ra 4 module riêng biệt để đúng convention, dễ maintain khi mỗi entity phát triển thêm nghiệp vụ riêng sau này. Đây là refactor **thuần cấu trúc** — không đổi route, DTO shape, hành vi guard, hay quy tắc nghiệp vụ nào. Spec đã cập nhật mục "Entity / dữ liệu" mô tả cách tách (đã duyệt).

## Nguyên tắc tách

- Guard dùng chung toàn app (`role.guard.ts` → `AuthorityGuard`) và `RoleEnum` ở lại `src/role/` (guard cần `RoleEnum` để check `SUPER_ADMIN` bypass). `authority.decorator.ts` (`@RequireAuthority`) chuyển sang `src/authority/` — đặt theo đúng entity nó mô tả, `role.guard.ts` import decorator này bằng import TS thuần (không phải NestJS module import) nên không tạo phụ thuộc vòng.
- Mỗi module con `TypeOrmModule.forFeature([EntityCủaNó])`, export `TypeOrmModule`. Module nào cần repository của entity khác thì `imports` module sở hữu entity đó (không tự khai `forFeature` trùng).
- Exception/validation tách theo entity sở hữu lỗi đó (đúng convention `<module>.exception.ts`/`<module>.validation.ts`), dải mã lỗi giữ nguyên số hiện có, chỉ di chuyển giữa các file.

## Việc sẽ làm

### 1. Module `Authority` (mới, `src/authority/`)

Di chuyển từ `src/role/`: `authority.entity.ts`, `authority.controller.ts`, `authority.service.ts`, `authority.controller.spec.ts`, `authority.service.spec.ts`.

Tạo mới:
- `authority.dto.ts` — chuyển `AuthorityResponseDto`, `GetAllAuthorityRequestDto`, `UpdateAuthorityRequestDto` từ `role.dto.ts` sang. `AuthorityResponseDto.authorityGroup` import `AuthorityGroupResponseDto` từ `src/authority-group/authority-group.dto.ts`.
- `authority.mapper.ts` — tách phần `createMap(Authority, AuthorityResponseDto, baseMapper())` từ `role.mapper.ts`.
- `authority.exception.ts` (`AuthorityException extends AppException`, giống mẫu `role.exception.ts`).
- `authority.validation.ts` — chuyển `AUTHORITY_NOT_FOUND` (giữ mã `100103`) từ `role.validation.ts` sang, đổi `RoleException(RoleValidation.AUTHORITY_NOT_FOUND)` trong service thành `AuthorityException(AuthorityValidation.AUTHORITY_NOT_FOUND)`.
- `authority.module.ts` — `forFeature([Authority])`, imports `AuthorityGroupModule` (cần repo `AuthorityGroup` để validate `authorityGroupSlug` khi update), controllers/providers tương ứng, export `TypeOrmModule`.

### 2. Module `AuthorityGroup` (mới, `src/authority-group/`)

Di chuyển: `authority-group.entity.ts`, `authority-group.controller.ts`, `authority-group.service.ts`, `authority-group.controller.spec.ts`, `authority-group.service.spec.ts`.

Tạo mới:
- `authority-group.dto.ts` — chuyển `AuthorityGroupResponseDto` từ `role.dto.ts`.
- `authority-group.mapper.ts` — tách phần map `AuthorityGroup → AuthorityGroupResponseDto`.
- `authority-group.exception.ts` (`AuthorityGroupException`).
- `authority-group.validation.ts` — chuyển `AUTHORITY_GROUP_NOT_FOUND` (giữ mã `100104`).
- `authority-group.module.ts` — `forFeature([AuthorityGroup])`, export `TypeOrmModule`.

### 3. Module `Permission` (mới, `src/permission/`)

Di chuyển: `permission.entity.ts`, `permission.controller.ts`, `permission.service.ts`, `permission.controller.spec.ts`, `permission.service.spec.ts`.

`permission.service.ts` cần repo `Role` và `Authority` → giữ nguyên logic, chỉ đổi import path của `Role`/`Authority` entity sang `src/role/role.entity`, `src/authority/authority.entity`; lỗi `ROLE_NOT_FOUND`/`AUTHORITY_NOT_FOUND` tiếp tục import từ `RoleException`/`AuthorityException` (không tạo lỗi riêng cho Permission — Permission không có quy tắc nghiệp vụ riêng ngoài việc tham chiếu 2 entity kia).

Tạo mới: `permission.module.ts` — `forFeature([Permission])`, imports `RoleModule` + `AuthorityModule`, export `TypeOrmModule`.

### 4. Module `Role` (giữ lại `src/role/`, rút gọn)

Giữ nguyên tại chỗ: `role.entity.ts`, `role.enum.ts`, `role.guard.ts` (`AuthorityGuard`), `authority.decorator.ts` (`@RequireAuthority`), `role.interceptor.ts` (`RoleBasedSerializationInterceptor`), `role.controller.ts`, `role.service.ts`, `role.exception.ts`, `role.controller.spec.ts`, `role.service.spec.ts`, `role.guard.spec.ts`.

Sửa:
- `role.dto.ts` — chỉ còn `CreateRoleRequestDto`, `UpdateRoleRequestDto`, `RoleResponseDto` (bỏ 3 DTO đã chuyển sang `authority`/`authority-group`).
- `role.mapper.ts` — chỉ còn map `Role → RoleResponseDto` (bỏ 2 map đã chuyển).
- `role.validation.ts` — chỉ còn `ROLE_NOT_FOUND` (100101), `ROLE_NAME_ALREADY_EXISTS` (100102), `ROLE_NAME_IS_REQUIRED` (100103) — đổi số `ROLE_NAME_IS_REQUIRED` từ `100105` xuống `100103` (2 mã `AUTHORITY_*` di chuyển ra module khác, số `100103`/`100104` cũ trống ra, dồn lại cho gọn dải role).
- `role.module.ts` — chỉ `forFeature([Role])`, `controllers: [RoleController]`, `providers: [RoleService, RoleProfile]`. **`AuthorityGuard` không đổi chỗ nhưng phải export ra để `app.module.ts` dùng được** — thêm `RoleModule` vào `exports` nếu cần, hoặc giữ cách `app.module.ts` đang import `AuthorityGuard` trực tiếp từ path file (không qua module export) như hiện tại — không cần đổi.

### 5. Đăng ký ở `app.module.ts`

Thêm `AuthorityModule`, `AuthorityGroupModule`, `PermissionModule` vào `imports` (cạnh `RoleModule` đã có).

### 6. `app.validation.ts`

Gộp thêm `AuthorityValidation`, `AuthorityGroupValidation` (giống cách đang gộp `RoleValidation`/`ExampleValidation`...).

### 7. Sửa import chéo còn sót

Grep toàn bộ `from 'src/role/role.dto'`, `from 'src/role/role.mapper'`, `RoleValidation.AUTHORITY_NOT_FOUND`, `RoleValidation.AUTHORITY_GROUP_NOT_FOUND`, `RoleException(RoleValidation.AUTHORITY` sau khi tách, sửa hết về path/class mới. Đặc biệt: `authority.controller.ts`/`.service.ts` hiện `import { RoleException } from './role.exception'` — đổi thành `import { AuthorityException } from './authority.exception'` (đã cùng thư mục sau khi move nên chỉ cần đổi tên).

## Verify

1. `npm run lint` + `npx tsc --noEmit` — bắt hết import path sai/thiếu.
2. `npm run test` — 41 test hiện có phải tiếp tục pass nguyên trạng (chỉ đổi vị trí file, không đổi assertion).
3. Không cần migration mới (không đổi schema/DB, chỉ đổi vị trí file TypeScript) — entity vẫn được TypeORM auto-glob theo `src/**/*.entity.ts` nên đổi thư mục không ảnh hưởng DB.
4. Không cần chạy lại `verify-feature` bằng gọi API thật (route/behavior không đổi) — nhưng nên khởi động `npm run dev` 1 lần xác nhận app boot được (bắt lỗi module circular-import nếu có, vd `PermissionModule` ↔ `RoleModule`/`AuthorityModule` phải là quan hệ 1 chiều, không vòng).

## File chính

- Mới: `src/authority/*`, `src/authority-group/*`, `src/permission/*` (entity/controller/service/dto/mapper/exception/validation/module/spec — di chuyển nguyên nội dung, sửa import).
- Sửa: `src/role/role.dto.ts`, `role.mapper.ts`, `role.validation.ts`, `role.module.ts`, `src/app/app.module.ts`, `src/app/app.validation.ts`.
- Xoá (sau khi move): `src/role/authority*.ts`, `src/role/permission*.ts` (trừ các file thuộc AuthorityGuard/decorator ở trên đã liệt kê giữ lại).

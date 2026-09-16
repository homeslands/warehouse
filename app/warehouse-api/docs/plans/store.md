# Plan: Module `Store` (cửa hàng / pháp nhân xuất hoá đơn)

## Context

Repo đã có master data kho (`warehouse`) và danh mục vật tư (`material-type`/`material`), nhưng **chưa có khái niệm "cửa hàng"** — không có pháp nhân nào đứng tên trên hoá đơn. Feature này tạo **master data cửa hàng**: thông tin định danh (`name`/`code`) + thông tin pháp nhân để in lên hoá đơn (`legalName`/`taxCode`/`invoiceAddress`) + thông tin liên hệ (`phonenumber`/`email`/`address`).

`Store` **độc lập hoàn toàn với `Warehouse`** — không FK, không bảng nối, không ràng buộc nghiệp vụ. Kho chứa vật tư; cửa hàng bán hàng và xuất hoá đơn. Đây là CRUD thuần, làm nền cho module sản phẩm + hoá đơn sau này (cả 2 **ngoài phạm vi** lần này).

Spec: `docs/specs/store.md`.

## Quyết định đã chốt với user (không tự đổi)

| Điểm | Quyết định |
|---|---|
| Field bắt buộc | `name`, `code`, `legalName`, `taxCode` — `invoiceAddress`/`phonenumber`/`email`/`address` optional |
| `isActive` | **Có** (default `true`), mirror `warehouse`: phải deactivate trước khi xoá |
| Base class | `VersionedBase` (optimistic locking — form 8 field, 2 admin sửa cùng lúc ghi đè nhau) |
| Validate | `taxCode` `/^\d{10}(-\d{3})?$/`, `email` `@IsEmail()`, `phonenumber` `/^0\d{8,10}$/` |
| Unique | `code` (DB UNIQUE) + `taxCode` + `name` (service, chỉ trong các bản ghi chưa xoá mềm) |
| Phân quyền | `@HasRole` (RBAC tĩnh) — **không** `@RequireAuthority`, **không** migration seed `Authority` |
| Quan hệ | Không có FK nào cả |

## Đã khảo sát (đọc trực tiếp, không cần Explore thêm)

- **Dải mã lỗi `1010xx` chưa ai dùng.** Đang dùng: auth `1000xx`, role `1001xx`, authority `1002xx`, authority-group `1003xx`, user `1004xx`, warehouse `1005xx`, material-type `1006xx`, material `1007xx`, warehouse-material `1008xx`, app-common `100800`, db `109000`, file `1210xx`, notification `1555xx`. Có guard chống trùng trong `src/app/app.validation.ts` → trùng là app không boot.
- **`@HasRole` không cần migration nào** (`CLAUDE.md` mục "Guard & decorator") — đây là mặc định cho module nghiệp vụ mới, khớp `warehouse`/`material-type`/`material`. Không đụng `authority.constants.ts`.
- **Module không phụ thuộc gì**: không cần import `UserModule` (khác `WarehouseModule`), chỉ `TypeOrmModule.forFeature([Store])`.
- Migration mới nhất là `1783728000015` → file mới dùng số **`1783728000016`**.
- **`typeorm:g` KHÔNG dùng được trên repo này** (`CLAUDE.md` mục "Nợ kỹ thuật") — nó đẻ ra lệnh drop/re-add cột của bảng khác. Viết tay SQL, mẫu: `1783728000013-create-warehouse-table.ts`.
- Automapper **không kế thừa map của DTO cha** → `UpdateStoreRequestDto extends CreateStoreRequestDto` vẫn phải `createMap` riêng (đúng pattern `warehouse.mapper.ts`).
- `tsconfig.json` có `strictNullChecks: false` → khai field optional không cần `?` cũng compile.
- Entity auto-discover bằng glob trong `src/config/database.config.ts`, nhưng `forFeature([Store])` trong module **vẫn bắt buộc**.
- `OptimisticLockExceptionFilter` đã đăng ký global → **không** try/catch `OptimisticLockVersionMismatchError` trong service.

## Các bước implement

### 1. `src/store/store.constants.ts`

```ts
export const STORE_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/;  // giống warehouse
export const STORE_PHONENUMBER_REGEX = /^0\d{8,10}$/;
export const STORE_TAX_CODE_REGEX = /^\d{10}(-\d{3})?$/;  // MST 10 số, hậu tố chi nhánh 3 số
```

### 2. `src/store/store.entity.ts` — `@Entity('store_tbl')`, `extends VersionedBase`

9 cột: `name_column`, `code_column` (UNIQUE), `legal_name_column`, `tax_code_column`, `invoice_address_column` (NULL), `phonenumber_column` (NULL), `email_column` (NULL), `address_column` (NULL), `is_active_column` (default `true`). Mỗi field `@AutoMap()`. Không `@ManyToOne` nào.

### 3. `src/store/store.validation.ts` — dải `1010xx`

`STORE_NOT_FOUND` (101001, 404), `*_NAME_IS_REQUIRED` (101002, 400), `*_NAME_DOES_EXIST` (101003), `*_CODE_IS_REQUIRED` (101004, 400), `*_CODE_INVALID` (101005, 400), `*_CODE_DOES_EXIST` (101006), `*_CODE_RESERVED_BY_DELETED_STORE` (101007), `*_LEGAL_NAME_IS_REQUIRED` (101008, 400), `*_TAX_CODE_IS_REQUIRED` (101009, 400), `*_TAX_CODE_INVALID` (101010, 400), `*_TAX_CODE_DOES_EXIST` (101011), `*_PHONENUMBER_INVALID` (101012, 400), `*_EMAIL_INVALID` (101013, 400), `*_IS_ACTIVE_INVALID` (101014, 400), `*_VERSION_IS_REQUIRED` (101015, 400), `*_ACTIVE_CANNOT_BE_DELETED` (101016).

### 4. `src/store/store.dto.ts`

- `CreateStoreRequestDto` — 9 field, message class-validator = **đúng key** trong `store.validation.ts`.
- `UpdateStoreRequestDto extends CreateStoreRequestDto` + `version: number` (`@IsNotEmpty` + `@IsInt`).
- `GetAllStoreRequestDto extends BaseQueryDto` + `isActive?: boolean` (`@Transform(toBoolean)`).
- `StoreResponseDto extends VersionedResponseDto` — 9 field `@AutoMap()`.

### 5. `src/store/store.mapper.ts`

`createMap(mapper, Store, StoreResponseDto, extend(baseMapper(mapper)), versionedMapper())`, + 2 map DTO→Entity dùng chung helper `normalizeStore()`: `code` → `trim().toUpperCase()`, `email` → `trim().toLowerCase()`, còn lại `trim()` (`taxCode` **chỉ** trim, không uppercase).

### 6. `src/store/store.service.ts`

`createStore` / `findAll` / `findOne` / `updateStore` / `deleteStore` + private `paginate`, `assertCodeIsFree` (tra `withDeleted: true`, phân biệt `CODE_DOES_EXIST` vs `CODE_RESERVED_BY_DELETED_STORE`), `assertNameIsFree`, `assertTaxCodeIsFree`. `updateStore` load bằng `lock: { mode: 'optimistic', version: dto.version }`, chỉ re-check unique khi giá trị **thực sự đổi**. `deleteStore` chặn `isActive` rồi `softRemove`.

### 7. `src/store/store.controller.ts` — `@ApiTags('Store')`, `@Controller('stores')`

5 route, `ValidationPipe({ transform: true, whitelist: true })` từng param, response `AppResponseDto`/`AppPaginatedResponseDto`. `@HasRole(RoleEnum.Admin)` cho POST/PATCH/DELETE, `@HasRole(Admin, Manager, Supervisor)` cho 2 route GET.

### 8. `src/store/store.module.ts` + `store.exception.ts`

### 9. Đăng ký (3 chỗ, thiếu chỗ nào cũng hỏng)

1. `src/app/app.module.ts` → `imports: [..., StoreModule]`
2. `src/app/app.validation.ts` → `...StoreValidation` + `TStoreErrorCode` vào type intersection
3. `store.module.ts` → `providers: [StoreService, StoreProfile]`

### 10. Migration `src/migrations/1783728000016-create-store-table.ts` (viết tay)

`CREATE TABLE store_tbl` — `UNIQUE INDEX IDX_store_slug`, `UNIQUE INDEX IDX_store_code`, `INDEX IDX_store_tax_code` (non-unique: uniqueness của `taxCode` do service lo, để nới ra sau không cần migration). Không FK. `down()` = `DROP TABLE`.

### 11. Test

`store.service.spec.ts` + `store.controller.spec.ts` theo mẫu `warehouse.*.spec.ts`, gồm test khoá metadata `@HasRole` trên từng route (gỡ nhầm decorator = test đỏ).

## Verify (theo `docs/WORKFLOW.md` bước 7)

`npm run lint` → `npm run test` → `npm run typeorm:r` → skill `verify-feature` (chạy app thật, gọi 5 route + từng quy tắc: trùng `code` hoa/thường, trùng `taxCode`, xoá khi đang `isActive`, sai `version` → 409 `DATA_VERSION_CONFLICT`, role `SUPERVISOR` gọi `POST /stores` → 403).

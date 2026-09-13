# Plan: Module `Warehouse` (kho + quản lý kho)


## Context

Repo đã seed sẵn toàn bộ authority của 4 loại phiếu kho (`IMPORT_FORM_*`, `EXPORT_FORM_*`, `BALANCE_FORM_*`, `WAREHOUSE_PAYMENT_*` — migration `1783728000012`) nhưng **chưa có entity `Warehouse` nào tồn tại**: không có bảng kho, không có khái niệm "kho này do ai quản lý". Mọi phiếu nhập/xuất/kiểm/chi sau này đều phải trỏ về 1 kho cụ thể, và ô "✓ (người duyệt)" của `MANAGER` trong bảng phân quyền 5.5 chỉ có nghĩa khi biết ai là quản lý của kho nào.

Feature này tạo **master data kho** + **phân công quản lý kho** (1 kho ↔ 1 `User` role `MANAGER`), làm nền cho các module phiếu kho tiếp theo. Kết quả mong muốn: ADMIN quản lý danh sách kho và phân công manager; MANAGER/SUPERVISOR đọc được danh sách kho để chọn khi lập phiếu; MANAGER xem được kho mình phụ trách.

## Quyết định đã chốt với user (không tự đổi)

| Điểm | Quyết định |
|---|---|
| Quan hệ manager | `@ManyToOne(() => User, { nullable: true })`, cột `manager_id_column` — 1 kho có tối đa 1 manager |
| Field | `name`, `code` (unique), `address`, `phonenumber`, `description`, `isActive` |
| Base class | `VersionedBase` (optimistic locking) |
| Phân quyền | 5 authority mới `WAREHOUSE_CREATE/READ/UPDATE/DELETE/ASSIGN_MANAGER` + migration seed |
| Ràng buộc manager | Phải là user **còn sống, `isActive`, role `MANAGER`**. 1 user được phụ trách **nhiều** kho |
| Scoping | Có thêm `GET /warehouses/mine` (chỉ cần JWT, không cần authority) |

## Đã khảo sát (đọc trực tiếp, không cần Explore thêm)

- `UserService.findBySlug(slug): Promise<User | null>` **đã có sẵn** (`src/user/user.service.ts:97`) và `UserModule` **export `UserService`** (`src/user/user.module.ts`) → tái dùng, không tự `forFeature([User])` trong `WarehouseModule`.
- `User.role` là `eager: true` → `findBySlug` trả về sẵn `role.name`, đủ cho cả 3 check (tồn tại / `isActive` / role) trong **1 query**, không cần `relations`.
- Không có vòng tròn import: `UserModule` chỉ import `RoleModule` + `TokenRevocationModule`, không biết gì về warehouse ⇒ `WarehouseModule → UserModule` một chiều, **không dùng `forwardRef`**.
- Dải mã lỗi `1005xx` **chưa ai dùng** (đang dùng: auth `1000xx`, role `1001xx`, authority `1002xx`, authority-group `1003xx`, user `1004xx`, app-common `1008xx`, db `109000`, file `1210xx`, notification `1555xx`, example `9999xx`).
- `tsconfig.json` có `strictNullChecks: false` → khai `manager: User;` (không `?`) vẫn compile.
- Entity được auto-discover bằng glob trong `src/config/database.config.ts`, nhưng `TypeOrmModule.forFeature([Warehouse])` trong module **vẫn bắt buộc**.
- Migration trong repo này là **SQL viết tay**, không phải output của `typeorm:g`. Mẫu DDL: `1783728000002-create-user-table.ts`, `1783728000003-create-example-table.ts`, `1783728000008-add-version-to-example-table.ts`. Mẫu seed authority: `1783728000012-seed-warehouse-form-authorities.ts`.

## Các bước implement

### 1. `docs/specs/warehouse.md`

Copy `docs/specs/_TEMPLATE.md`, điền: bảng field (mục 2), quy tắc nghiệp vụ (mục 5), ma trận quyền (mục 8), 7 endpoint (mục 6). Mục "Ngoài phạm vi" ghi rõ: chưa hỗ trợ `sort`, chưa có row-level scoping của phiếu theo kho, 1 manager được phụ trách nhiều kho, chưa có restore kho đã xoá, chưa có lịch sử đổi manager.

### 2. `src/authority/authority.constants.ts` — thêm 5 code (làm trước, không controller nào compile được nếu thiếu)

```ts
  // ===== Seed ở migration 1783728000014 (Warehouse master data) =====
  WarehouseCreate: 'WAREHOUSE_CREATE',
  WarehouseRead: 'WAREHOUSE_READ',
  WarehouseUpdate: 'WAREHOUSE_UPDATE',
  WarehouseDelete: 'WAREHOUSE_DELETE',
  WarehouseAssignManager: 'WAREHOUSE_ASSIGN_MANAGER',
```

⚠️ Đã có sẵn nhóm `WarehousePayment*` trong file — đọc kỹ khi sửa, key mới là `Warehouse*` không hậu tố.

### 3. `src/warehouse/` — copy `src/example/`, đổi tên, sửa theo domain

Thứ tự viết: `constants` → `entity` → `validation` → `exception` → `dto` → `mapper` → `service` → `controller` → `module`.

#### `warehouse.constants.ts`

```ts
// Kho có thể dùng số cố định (024xxxxxxxx) nên KHÔNG tái dùng VN_PHONENUMBER_REGEX của user
// (chỉ khớp di động 0[35789]xxxxxxxx) — sẽ chặn nhầm số bàn của kho.
export const WAREHOUSE_PHONENUMBER_REGEX = /^0\d{8,10}$/;
export const WAREHOUSE_CODE_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,30}[a-zA-Z0-9])$/;
```

#### `warehouse.entity.ts`

```ts
@Entity('warehouse_tbl')
export class Warehouse extends VersionedBase {
  @AutoMap() @Column({ name: 'name_column' })                        name: string;
  @AutoMap() @Column({ name: 'code_column', unique: true })          code: string;
  @AutoMap() @Column({ name: 'address_column' })                     address: string;
  @AutoMap() @Column({ name: 'phonenumber_column', nullable: true }) phonenumber?: string;
  @AutoMap() @Column({ name: 'description_column', nullable: true }) description?: string;
  @AutoMap() @Column({ name: 'is_active_column', default: true })    isActive: boolean;

  // KHÔNG @AutoMap() trên quan hệ (giống User.role) — flatten thủ công bằng forMember trong mapper.
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'manager_id_column' })
  manager: User;
}
```

- **Không `eager`**: `manager` eager sẽ kéo theo `User.role` (cũng eager) vào *mọi* query kể cả list phân trang. Thay vào đó khai 1 hằng trong service và dùng ở **mọi** read path:
  ```ts
  const WAREHOUSE_RELATIONS: FindOptionsRelations<Warehouse> = { manager: true };
  ```
- Chỉ `code` có UNIQUE ở DB; `name` unique chỉ check ở service (đổi tên kho phải rẻ).

#### `warehouse.validation.ts` — dải `1005xx`

Cấu trúc file y hệt `example.validation.ts` (`export const KEY = 'KEY'` → union `TWarehouseErrorCodeKey` → `TWarehouseErrorCode` → object).

| Key | Code | Message | HttpStatus |
|---|---|---|---|
| `WAREHOUSE_NOT_FOUND` | 100501 | Warehouse not found | `NOT_FOUND` |
| `WAREHOUSE_NAME_IS_REQUIRED` | 100502 | Warehouse name is required | `BAD_REQUEST` |
| `WAREHOUSE_NAME_DOES_EXIST` | 100503 | Warehouse name does exist | *(422)* |
| `WAREHOUSE_CODE_IS_REQUIRED` | 100504 | Warehouse code is required | `BAD_REQUEST` |
| `WAREHOUSE_CODE_INVALID` | 100505 | Warehouse code must be 2-32 chars of letters, digits or hyphen (e.g. WH-HN-01) | `BAD_REQUEST` |
| `WAREHOUSE_CODE_DOES_EXIST` | 100506 | Warehouse code does exist | *(422)* |
| `WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE` | 100507 | Warehouse code is still held by a deleted warehouse | *(422)* |
| `WAREHOUSE_ADDRESS_IS_REQUIRED` | 100508 | Warehouse address is required | `BAD_REQUEST` |
| `WAREHOUSE_PHONENUMBER_INVALID` | 100509 | Warehouse phone number is invalid | `BAD_REQUEST` |
| `WAREHOUSE_IS_ACTIVE_INVALID` | 100510 | isActive must be a boolean | `BAD_REQUEST` |
| `WAREHOUSE_HAS_MANAGER_INVALID` | 100511 | hasManager must be a boolean | `BAD_REQUEST` |
| `WAREHOUSE_VERSION_IS_REQUIRED` | 100512 | Version is required and must be an integer | `BAD_REQUEST` |
| `WAREHOUSE_MANAGER_SLUG_IS_REQUIRED` | 100513 | managerSlug is required — send null to unassign | `BAD_REQUEST` |
| `WAREHOUSE_MANAGER_NOT_FOUND` | 100514 | Manager user not found | `NOT_FOUND` |
| `WAREHOUSE_MANAGER_INACTIVE` | 100515 | Manager user is inactive | *(422)* |
| `WAREHOUSE_MANAGER_ROLE_INVALID` | 100516 | Assigned manager must be a user with the MANAGER role | *(422)* |
| `WAREHOUSE_ACTIVE_CANNOT_BE_DELETED` | 100517 | Deactivate the warehouse before deleting it | *(422)* |

`warehouse.exception.ts`: copy nguyên `example.exception.ts`, đổi tên class.

#### `warehouse.dto.ts`

- `CreateWarehouseRequestDto`: `name`, `code`, `address` (bắt buộc, `@Transform` trim; `code` thêm `.toUpperCase()` và `@Matches(WAREHOUSE_CODE_REGEX)`), `phonenumber?` (`@Matches(WAREHOUSE_PHONENUMBER_REGEX)`), `description?`, `isActive?` (`@IsBoolean`, default `true`). **Không có `managerSlug`.**
- `UpdateWarehouseRequestDto extends CreateWarehouseRequestDto` + `version: number` (`@IsNotEmpty` + `@IsInt`, cả hai dùng message `WAREHOUSE_VERSION_IS_REQUIRED`).
- `AssignWarehouseManagerRequestDto`: `managerSlug: string | null` + `version: number`.
  ```ts
  // @IsDefined chứ không @IsOptional: `null` là giá trị HỢP LỆ (bỏ phân công), thiếu hẳn key thì
  // phải báo lỗi — @IsOptional() bỏ qua CẢ hai nên không phân biệt được 2 trường hợp.
  @IsDefined({ message: 'WAREHOUSE_MANAGER_SLUG_IS_REQUIRED' })
  @ValidateIf((o) => o.managerSlug !== null)
  @IsNotEmpty({ message: 'WAREHOUSE_MANAGER_SLUG_IS_REQUIRED' })
  managerSlug: string | null;
  ```
- `GetMyWarehouseRequestDto extends BaseQueryDto`: `isActive?`.
- `GetAllWarehouseRequestDto extends GetMyWarehouseRequestDto`: thêm `managerSlug?`, `hasManager?`.
  ```ts
  // Query string trả về 'true'/'false'. KHÔNG dùng @Type(() => Boolean): Boolean('false') === true.
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  ```
- `WarehouseResponseDto extends VersionedResponseDto`: `name`, `code`, `address`, `phonenumber?`, `description?`, `isActive` (đều `@AutoMap()`), cộng `managerSlug?` + `managerPhonenumber?` (**không** `@AutoMap()`, đến từ `forMember`; `User` không có field tên nên `phonenumber` là thông tin hữu ích duy nhất ngoài slug).

#### `warehouse.mapper.ts`

```ts
createMap(mapper, Warehouse, WarehouseResponseDto,
  extend(baseMapper(mapper)),
  versionedMapper(),
  forMember((d) => d.managerSlug, mapFrom((s) => s.manager?.slug)),
  forMember((d) => d.managerPhonenumber, mapFrom((s) => s.manager?.phonenumber)),
);
createMap(mapper, CreateWarehouseRequestDto, Warehouse, /* trim name/address, upper code */);
createMap(mapper, UpdateWarehouseRequestDto, Warehouse, /* y hệt */);
```

Automapper **không kế thừa** map của DTO cha → phải khai cả 2 map Create/Update.

#### `warehouse.service.ts`

`@InjectRepository(Warehouse)` + `@InjectMapper()` + `@Inject(WINSTON_MODULE_NEST_PROVIDER)` + `private readonly userService: UserService`.

| Method | Nội dung |
|---|---|
| `createWarehouse` | Check `code`: `findOne({ where: { code }, withDeleted: true })` → nếu có và `deletedAt == null` ⇒ `WAREHOUSE_CODE_DOES_EXIST`, nếu soft-deleted ⇒ `WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE` (chặn trước để MySQL không ném `ER_DUP_ENTRY` thành 500). Check `name`: `findOneBy({ name })` ⇒ `WAREHOUSE_NAME_DOES_EXIST`. Rồi `save(create(data))`. |
| `findAll(query)` | Build `where` (xem dưới), `findAndCount({ where, relations: WAREHOUSE_RELATIONS, order: { createdAt: 'DESC' }, skip, take })`, math phân trang copy từ `ExampleService` (giữ nguyên typo `hasPrevios`). |
| `findMine(userId, query)` | Như `findAll` nhưng `where.manager = { id: userId }`, bỏ qua `managerSlug`/`hasManager`. |
| `findOne(slug)` | `findOne({ where: { slug }, relations: WAREHOUSE_RELATIONS })`, không có ⇒ `WAREHOUSE_NOT_FOUND`. |
| `updateWarehouse(slug, dto)` | `findOne({ where: { slug }, relations, lock: { mode: 'optimistic', version: dto.version } })`. Chỉ re-check unique khi `data.code !== warehouse.code` / `data.name !== warehouse.name`. `Object.assign` + `save`. **Không try/catch** — `OptimisticLockExceptionFilter` global lo. |
| `assignManager(slug, dto)` | Load kho như trên (có `lock`). Nếu `dto.managerSlug === null` ⇒ `warehouse.manager = null`, **không gọi `userService`**. Ngược lại `userService.findBySlug` → không có ⇒ `WAREHOUSE_MANAGER_NOT_FOUND`; `!isActive` ⇒ `WAREHOUSE_MANAGER_INACTIVE`; `role?.name !== RoleEnum.Manager` ⇒ `WAREHOUSE_MANAGER_ROLE_INVALID`. Gán rồi `save`, trả `WarehouseResponseDto` đã bump `version`. |
| `deleteWarehouse(slug)` | Không có ⇒ `WAREHOUSE_NOT_FOUND`; `isActive === true` ⇒ `WAREHOUSE_ACTIVE_CANNOT_BE_DELETED` (rào chống xoá nhầm rẻ nhất, cùng tinh thần rule "không xoá product còn tồn" trong `docs/specs/product.md`); ngược lại `softRemove(entity)` trả `1`. Kho đã xoá **giữ nguyên** `manager_id_column`. |

Build `where` cho `findAll`:
```ts
const where: FindOptionsWhere<Warehouse> = {};
if (query.isActive !== undefined) where.isActive = query.isActive;
if (query.managerSlug) where.manager = { slug: query.managerSlug };
else if (query.hasManager === true) where.manager = Not(IsNull());
else if (query.hasManager === false) where.manager = IsNull();
```
`where.manager = { slug }` đúng pattern `role: { slug }` đang chạy trong `UserService.findAll`. ⚠️ `IsNull()/Not(IsNull())` trên `ManyToOne` là chỗ duy nhất cần **verify bằng request thật**; nếu TypeORM sinh SQL sai, đổi nhánh `hasManager` sang `createQueryBuilder().andWhere('warehouse.manager_id_column IS NULL')` hoặc bỏ hẳn filter đó.

Chuẩn hoá dữ liệu nằm ở mapper (`trim`, `code.toUpperCase()`) ⇒ `wh-hn-01` và `WH-HN-01` là trùng.

#### `warehouse.controller.ts`

`@ApiTags('Warehouse') @Controller('warehouses') @ApiBearerAuth()`

| # | Route | Guard | Code | Input | `result` |
|---|---|---|---|---|---|
| 1 | `POST /warehouses` | `@RequireAuthority(WarehouseCreate)` | 201 | `CreateWarehouseRequestDto` | `WarehouseResponseDto` |
| 2 | `GET /warehouses` | `@RequireAuthority(WarehouseRead)` | 200 | `GetAllWarehouseRequestDto` | `AppPaginatedResponseDto<WarehouseResponseDto>` |
| 3 | `GET /warehouses/mine` | **không decorator** (chỉ cần JWT) | 200 | `GetMyWarehouseRequestDto` + `@CurrentUser()` | `AppPaginatedResponseDto<WarehouseResponseDto>` |
| 4 | `GET /warehouses/:slug` | `@RequireAuthority(WarehouseRead)` | 200 | — | `WarehouseResponseDto` |
| 5 | `PATCH /warehouses/:slug` | `@RequireAuthority(WarehouseUpdate)` | 200 | `UpdateWarehouseRequestDto` | `WarehouseResponseDto` |
| 6 | `PUT /warehouses/:slug/manager` | `@RequireAuthority(WarehouseAssignManager)` | 200 | `AssignWarehouseManagerRequestDto` | `WarehouseResponseDto` |
| 7 | `DELETE /warehouses/:slug` | `@RequireAuthority(WarehouseDelete)` | 200 | — | `string` |

⚠️ **`GET /warehouses/mine` phải khai TRƯỚC `GET /warehouses/:slug`** trong class, nếu không `:slug` nuốt mất route `mine`.

Mọi handler: `@HttpCode`, `@ApiOperation({ summary })`, `@ApiResponseWithType({...})` (hoặc `@ApiPaginatedResponse(WarehouseResponseDto, 'Retrieved')`), `@ApiParam({ name: 'slug' })` cho #4–#7, `new ValidationPipe({ transform: true, whitelist: true })` trên từng `@Body`/`@Query`, và **tự build** object `AppResponseDto` (`message`/`statusCode`/`timestamp`/`result`).

Khác `example.controller.ts` có chủ ý:
- **GET không `@Public()`** — master data kho là dữ liệu nội bộ, cả 2 route đọc đều cần `WAREHOUSE_READ`.
- **#6 là `PUT` chứ không phải `PATCH`/`DELETE`**: nó thay thế đúng 1 slot manager, idempotent, và `managerSlug: null` xử lý luôn việc gỡ phân công trong cùng code path. `version` bắt buộc trên endpoint này vì nó ghi cùng row ⇒ xung đột với form sửa đang mở sẽ trả `DATA_VERSION_CONFLICT` (409) thay vì lost update.
- **`managerSlug` KHÔNG nằm trong Create/Update DTO**: `AuthorityGuard` chỉ chặn theo endpoint chứ không theo field — nếu để `managerSlug` trong body create, ai có `WAREHOUSE_CREATE` cũng phân công được manager mà không cần `WAREHOUSE_ASSIGN_MANAGER`, và cách duy nhất để chặn là đọc `currentUser.scope` trong service — đúng thứ mà CLAUDE.md đã cố tình loại bỏ ở lần refactor change-password.

#### `warehouse.module.ts`

```ts
imports: [TypeOrmModule.forFeature([Warehouse]), UserModule],
controllers: [WarehouseController],
providers: [WarehouseService, WarehouseProfile],
exports: [WarehouseService],
```

### 4. Đăng ký (3 chỗ, thiếu chỗ nào cũng hỏng)

- `src/app/app.module.ts` → thêm `WarehouseModule` vào `imports`.
- `src/app/app.validation.ts` → **3 sửa đổi riêng biệt**: thêm `import`, thêm `TWarehouseErrorCode` vào intersection type, thêm `...WarehouseValidation` vào object. Thiếu type = lỗi compile; thiếu spread = compile OK nhưng mọi lỗi warehouse tụt về 400 raw.
- `WarehouseProfile` trong `providers` của module (quên = lỗi runtime "Mapping not found", không phải compile error).

### 5. Migration (viết tay, **không** chạy `typeorm:g`)

#### `src/migrations/1783728000013-create-warehouse-table.ts` — `CreateWarehouseTable1783728000013`

```sql
CREATE TABLE `warehouse_tbl` (
  `id_column` VARCHAR(36) NOT NULL,
  `slug_column` VARCHAR(255) NOT NULL,
  `name_column` VARCHAR(255) NOT NULL,
  `code_column` VARCHAR(32) NOT NULL,
  `address_column` VARCHAR(255) NOT NULL,
  `phonenumber_column` VARCHAR(20) NULL,
  `description_column` VARCHAR(255) NULL,
  `is_active_column` TINYINT NOT NULL DEFAULT 1,
  `manager_id_column` VARCHAR(36) NULL,
  `version_column` INT NOT NULL DEFAULT 1,
  `created_at_column` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at_column` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `deleted_at_column` DATETIME(6) NULL,
  `created_by_column` VARCHAR(255) NULL,
  UNIQUE INDEX `IDX_warehouse_slug` (`slug_column`),
  UNIQUE INDEX `IDX_warehouse_code` (`code_column`),
  INDEX `IDX_warehouse_manager` (`manager_id_column`),
  PRIMARY KEY (`id_column`),
  CONSTRAINT `FK_warehouse_manager` FOREIGN KEY (`manager_id_column`)
    REFERENCES `user_tbl` (`id_column`) ON DELETE SET NULL
) ENGINE=InnoDB;
```

`down()`: `DROP TABLE \`warehouse_tbl\``.

**`ON DELETE SET NULL`** (không phải `RESTRICT` như `FK_user_role`): "kho chưa có manager" là trạng thái hợp lệ theo thiết kế, nên xoá user nên thoái hoá về trạng thái đó thay vì chặn cứng. `FK_user_role` dùng `RESTRICT` vì cột đó `NOT NULL` — `SET NULL` không hợp lệ ở đó.

#### `src/migrations/1783728000014-seed-warehouse-authorities.ts` — `SeedWarehouseAuthorities1783728000014`

Clone cấu trúc `1783728000012`: cùng `AuthorityGroupName` const (ở đây chỉ 1 nhóm `Warehouse`), cùng interface `AuthoritySeed` kèm doc comment, cùng `uuidv4()` + `getRandomString()`, cùng idempotency (`SELECT ... LIMIT 1` trước mỗi `INSERT`), cùng `down()` xoá permission → authority → xoá group **chỉ khi** không còn authority nào. Export mảng `WAREHOUSE_AUTHORITY_SEED`.

| `code` | `name` | `defaultRoles` |
|---|---|---|
| `WAREHOUSE_CREATE` | Tạo kho | `[Admin]` |
| `WAREHOUSE_READ` | Xem danh sách/chi tiết kho | `[Admin, Manager, Supervisor]` |
| `WAREHOUSE_UPDATE` | Sửa thông tin kho | `[Admin]` |
| `WAREHOUSE_DELETE` | Xoá kho | `[Admin]` |
| `WAREHOUSE_ASSIGN_MANAGER` | Phân công quản lý kho | `[Admin]` |

Lý do, nhất quán với bảng 5.5 đã seed ở `...012`: *kho nào tồn tại* là master data cấp tổ chức — quyết định của ADMIN; MANAGER/SUPERVISOR chỉ **vận hành bên trong** kho và đã có sẵn authority của 4 loại phiếu. `WAREHOUSE_READ` cấp cho cả 3 vì mọi màn hình lập phiếu đều cần dropdown chọn kho. `WAREHOUSE_ASSIGN_MANAGER` giữ riêng ADMIN vì cấp cho MANAGER là để họ tự bổ nhiệm mình vào bất kỳ kho nào. `SUPER_ADMIN` **không xuất hiện** — nó bypass ngay trong `AuthorityGuard` (cùng lý do đã ghi ở `...011`/`...012`).

Chạy: review diff rồi `npm run typeorm:r` (đã allowlist). `npm run typeorm:rv` phải hỏi user trước.

### 6. Test

`warehouse.service.spec.ts` — wiring như `example.service.spec.ts`, **thêm** `{ provide: UserService, useValue: { findBySlug: jest.fn() } }` (mock nên `UserService` không kéo theo Redis/ConfigService), `await module.init()`. Repo mock: `{ findOne, findOneBy, create, save, findAndCount, softRemove }`. Case:

- `createWarehouse`: happy path; trùng code live ⇒ `WAREHOUSE_CODE_DOES_EXIST`; trùng code đã soft-delete ⇒ `WAREHOUSE_CODE_RESERVED_BY_DELETED_WAREHOUSE`; trùng name ⇒ `WAREHOUSE_NAME_DOES_EXIST`; chuẩn hoá `' wh-hn-01 '` → `save` nhận `'WH-HN-01'`.
- `findAll`: assert object truyền vào `findAndCount` (`where` cho từng filter + `relations: { manager: true }`); math phân trang gồm key `hasPrevios`; response có `managerSlug`/`managerPhonenumber`/`version`.
- `findMine`: `where.manager = { id: userId }`, không dính `managerSlug` client gửi lên.
- `updateWarehouse`: `findOne` nhận `lock: { mode: 'optimistic', version }`; bỏ qua re-check unique khi không đổi; không try/catch (mock reject phải propagate).
- `assignManager`: 4 nhánh lỗi + happy path + `managerSlug: null` (assert `userService.findBySlug` **không** được gọi).
- `deleteWarehouse`: `isActive: true` ⇒ throw và `softRemove` **không** được gọi; `isActive: false` ⇒ `softRemove(entity)` trả `1`; không tồn tại ⇒ `WAREHOUSE_NOT_FOUND`.

`warehouse.controller.spec.ts` — mock toàn bộ service, assert 7 handler wrap đúng `AppResponseDto` (statusCode 201/200), forward đúng tham số, có 1 case `managerSlug: null` để chứng minh controller không nuốt mất `null`.

Không test được ở unit level (ghi rõ để không ai tưởng đã cover): `AuthorityGuard`, các `ValidationPipe` decorator, và SQL của `IsNull()`. Repo **chưa có e2e spec nào** — đừng bịa ra, dùng skill `verify-feature` thay thế.

## Verify (theo `docs/WORKFLOW.md` bước 7)

1. `npm run lint` và `npm run test` trong `app/warehouse-api` (hook `PostToolUse` đã tự `eslint --fix` từng file, nhưng vẫn phải chạy full).
2. `npm run typeorm:r`, kiểm tra bảng `warehouse_tbl` + 5 row trong `authority_tbl` (`code LIKE 'WAREHOUSE\_%'` nhưng loại `WAREHOUSE_PAYMENT_%`) + row `permission_tbl` tương ứng.
3. Chạy skill `verify-feature` (`.claude/skills/verify-feature/SKILL.md`) trên app thật, login bằng `ROOT_PHONENUMBER`/`ROOT_PASSWORD`, gọi lần lượt 7 route dưới prefix `/api/${VERSION}/warehouses`, assert:
   - shape `AppResponseDto`, response **không lộ `id`**, có `slug` + `version`;
   - tạo trùng `code` (khác hoa/thường) ⇒ 422 `100506`;
   - `PATCH` với `version` cũ ⇒ 409 `100800`;
   - `PUT .../manager` với user role `SUPERVISOR` ⇒ 422 `100516`; với user không tồn tại ⇒ 404 `100514`; với `null` ⇒ 200 và `managerSlug` biến mất;
   - `DELETE` khi `isActive: true` ⇒ 422 `100517`, sau khi `PATCH isActive:false` ⇒ 200;
   - `GET /warehouses?hasManager=false` trả đúng tập kho chưa có manager (**đây là chỗ duy nhất verify được nhánh `IsNull()`**);
   - `GET /warehouses/mine` bằng token của manager vừa gán ⇒ chỉ thấy kho của mình; bằng token root ⇒ rỗng;
   - gọi `POST /warehouses` bằng token role `SUPERVISOR` ⇒ 403.
4. Kiểm tra Swagger `/api/api-docs` hiển thị đủ 7 route dưới tag `Warehouse`.

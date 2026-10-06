# Inventory: rename `warehouse_material` → `inventory`, add `reserved_quantity`, pessimistic lock, `inventory_history`

## Context

Tồn kho theo kho đang nằm ở `warehouse_material_tbl` / module `src/warehouse-material/`. Chuẩn bị cho phiếu nhập/xuất, cần:
- đổi tên khái niệm thành **Inventory** (bảng `inventory_tbl`, entity `Inventory`, module `src/inventory/`);
- thêm `reserved_quantity` (lượng đã giữ chỗ cho phiếu xuất chưa hoàn tất);
- **pessimistic lock** (`SELECT ... FOR UPDATE`) trên dòng tồn mỗi khi đổi `quantity`/`reserved`, để ghi được snapshot trước/sau chính xác;
- bảng **`inventory_history_tbl`** (append-only, N:1 với inventory) ghi mọi thay đổi tồn, trong cùng transaction.

Quyết định đã chốt với user: Pessimistic (không thêm cột version, entity vẫn `Base`); đổi tên toàn bộ nhưng **giữ route** `/warehouses/:warehouseSlug/materials` và **giữ mã lỗi số**; history dạng snapshot đầy đủ + API đọc.

## 1. Đổi tên module (code)

`git mv src/warehouse-material src/inventory`, đổi tên file `warehouse-material.*` → `inventory.*`, class/biến:
`WarehouseMaterial` → `Inventory`, `WarehouseMaterialService/Controller/Module/Exception/Validation/Profile` → `Inventory*`, DTO `*WarehouseMaterial*Dto` → `*Inventory*Dto`, repo `warehouseMaterialRepository` → `inventoryRepository`.
- Error key `WAREHOUSE_MATERIAL_*` → `INVENTORY_*`, **giữ nguyên số mã** (UI không tham chiếu key — đã grep `warehouse-ui`). Sửa message trong DTO decorator cho khớp key.
- `@Controller('warehouses/:warehouseSlug/materials')` giữ nguyên; `@ApiTags` đổi `'Inventory'`.
- Cập nhật tham chiếu: `src/app/app.module.ts`, `src/app/app.validation.ts`, `src/material/material.module.ts` + `material.service.ts` (+ spec, comment `warehouse_material_tbl`), `src/warehouse/guard/warehouse-scope.guard.ts`, `src/store/store.service.ts`, `src/unit/unit.validation.ts` (comment/dải mã), `src/material/material.entity.ts` (comment).
- Cập nhật `CLAUDE.md` (list `src/`, mục DECIMAL, nợ kỹ thuật) và `docs/specs/material.md` theo tên mới.

## 2. Entity

`src/inventory/inventory.entity.ts`: `@Entity('inventory_tbl')`, `@Unique('UQ_inventory', ['warehouse','material'])`, thêm:
```ts
@AutoMap()
@Column({ name: 'reserved_quantity_column', type: 'decimal', precision: 18, scale: 6, default: 0, transformer: decimalToNumber })
reservedQuantity: number;

@OneToMany(() => InventoryHistory, (h) => h.inventory)
histories: InventoryHistory[];
```
Bất biến: `0 <= reservedQuantity <= quantity`. Response DTO thêm `reservedQuantity` và `availableQuantity` (= quantity − reserved, map bằng `mapFrom` trong `inventory.mapper.ts`).

`src/inventory/inventory-history.entity.ts` (extends `Base`, append-only, theo mẫu `src/store/store-warehouse-history.entity.ts`):
- `inventory` `@ManyToOne(() => Inventory, (i) => i.histories, { nullable: false })` → `inventory_id_column`
- `action` varchar(16): `InventoryHistoryAction` trong `src/inventory/inventory.constants.ts` = `ASSIGN | ADJUST | RESERVE | RELEASE | REMOVE` (RESERVE/RELEASE khai sẵn cho phiếu xuất, chưa có endpoint ghi)
- `quantityDelta`, `quantityBefore`, `quantityAfter`, `reservedDelta`, `reservedBefore`, `reservedAfter`: DECIMAL(18,6) + `decimalToNumber`
- `note` varchar(255) nullable
- `changedBy` `@ManyToOne(() => User, { nullable: true })` → `changed_by_id_column`

Đăng ký cả 2 entity trong `TypeOrmModule.forFeature` của `InventoryModule`; module import `DbModule` (cho `TransactionManagerService`).

## 3. Service — pessimistic lock + ghi history

Mọi thao tác ghi tồn chạy trong `TransactionManagerService.execute` (`src/db/transaction-manager.service.ts`) và theo đúng 1 khuôn (helper private `mutate(manager, rowId, fn, action, changedBy, note?)`):
1. `manager.findOne(Inventory, { where: { id }, lock: { mode: 'pessimistic_write' } })` — **không kèm relations** (MySQL `FOR UPDATE` với LEFT JOIN khoá cả bảng join; load relations sau commit qua `findRow`).
2. Tính giá trị mới bằng `roundToScale`, kiểm bất biến, `manager.save(row)`.
3. `manager.save(InventoryHistory, {...snapshot before/after, delta, action, changedBy})`.

Áp dụng:
- `assignMaterial` → tạo row + history `ASSIGN` (before=0, after=quantity ban đầu) trong 1 transaction (không cần lock vì row mới).
- `adjustQuantity` → thay câu UPDATE nguyên tử bằng lock-đọc-ghi; chặn `quantity + delta < reservedQuantity` (thay cho `>= 0`) bằng mã mới `INVENTORY_QUANTITY_BELOW_RESERVED`; giữ `INVENTORY_QUANTITY_NEGATIVE` khi kết quả < 0. Viết lại comment cũ ("1 câu UPDATE, không đọc-rồi-ghi") cho đúng cơ chế mới.
- `removeMaterial` → chặn thêm khi `reservedQuantity > 0` (`INVENTORY_RESERVED_NOT_EMPTY`); ghi history `REMOVE` trước `softRemove`, tất cả trong transaction có lock.
- `updateThresholds` không đụng tồn → không lock, không ghi history.
- Controller `adjust`/`assign`/`remove` thêm `@CurrentUser() user: CurrentUserDto` để truyền `user.userId` → `changedBy`. Body `AdjustInventoryQuantityRequestDto` thêm `note?` optional (`@MaxLength(255)`).
- Mã lỗi mới thêm vào `inventory.validation.ts` trong dải mã sẵn có của module (kiểm tra không trùng).

API đọc mới: `GET /warehouses/:warehouseSlug/materials/:materialSlug/histories` (phân trang `BaseQueryDto`, `createdAt DESC`, `changedBy` load `withDeleted`), `@RequireAuthority(MaterialRead, WarehouseRead)` — giống quyền `GET .../materials`, không đẻ authority mới ⇒ không cần migration seed. `InventoryHistoryResponseDto` (slug, action, các delta/before/after, note, `changedBy` userName) + map trong `inventory.mapper.ts` với `extend(baseMapper(mapper))`.

## 4. Migration (viết tay — `typeorm:g` không dùng được trên repo)

`src/migrations/1783728000036-rename-warehouse-material-to-inventory.ts`:
- `up`: `RENAME TABLE warehouse_material_tbl TO inventory_tbl`; đổi tên index/FK cho khớp (`IDX_warehouse_material_slug` → `IDX_inventory_slug`, `UQ_warehouse_material` → `UQ_inventory`, `IDX_warehouse_material_material` → `IDX_inventory_material`, FK `FK_warehouse_material_warehouse/_material` → `FK_inventory_warehouse/_material` — FK phải DROP + ADD lại, giữ nguyên `ON DELETE CASCADE`/`RESTRICT` như migration 015); `ADD COLUMN reserved_quantity_column DECIMAL(18,6) NOT NULL DEFAULT 0`.
- `down`: đảo ngược đủ (drop cột, đổi tên lại index/FK, rename bảng về cũ).

`src/migrations/1783728000037-create-inventory-history-table.ts` theo khuôn `1783728000030`: các cột ở mục 2, `INDEX (inventory_id_column, created_at_column)`, FK `inventory_id_column → inventory_tbl` **RESTRICT** (inventory chỉ xoá mềm; không được xoá cứng làm mất lịch sử), `changed_by_id_column → user_tbl` SET NULL. `down`: DROP TABLE.

Không có backfill history cho tồn hiện có (lịch sử bắt đầu từ thời điểm migrate) — ghi chú điều này trong comment migration.

**`npm run typeorm:r` chỉ chạy sau khi user đồng ý** (CLAUDE.md root: thao tác đổi schema DB thật phải hỏi trước).

## 5. Test

- Đổi tên `inventory.controller.spec.ts` / `inventory.service.spec.ts`; cập nhật mock: service giờ dùng `TransactionManagerService` (mock `execute` gọi thẳng callback với fake manager).
- Thêm case: adjust ghi đúng 1 history với before/after; adjust bị chặn khi xuống dưới `reservedQuantity`; remove bị chặn khi `reservedQuantity > 0`; `findOne` được gọi với `lock: { mode: 'pessimistic_write' }`; metadata `REQUIRE_AUTHORITY_KEY` của route histories.
- Sửa `material.service.spec.ts` theo tên repo mới.

## Verification

1. `npm run lint`, `npm run test` (trong `app/warehouse-api`).
2. Hỏi user rồi `npm run typeorm:r`; kiểm tra `SHOW CREATE TABLE inventory_tbl` / `inventory_history_tbl` (tên index/FK, cột reserved).
3. `npm run dev`, gọi bằng token root: `POST /warehouses/{w}/materials` → `PATCH .../{m}/quantity` (delta +5, note) → `GET .../{m}/histories` thấy 2 dòng ASSIGN/ADJUST với before/after đúng; `UPDATE inventory_tbl SET reserved_quantity_column=3` rồi delta −4 ⇒ `INVENTORY_QUANTITY_BELOW_RESERVED`, DELETE ⇒ `INVENTORY_RESERVED_NOT_EMPTY`.
4. Bắn ~20 request adjust song song (`xargs -P`) → tổng tồn = tổng delta và số dòng history = số request (khẳng định lock không làm mất cập nhật).
5. `npm run test:e2e` vì đổi hành vi API.

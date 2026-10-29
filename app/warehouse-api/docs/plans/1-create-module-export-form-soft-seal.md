# Plan: export-form + material-batch modules (WMS-20)

## Context

The warehouse can receive stock (import-form → `InventoryService.receive`) but has no way to issue it, and stock isn't tracked by batch or expiry. This change adds:

1. **material-batch** (read-only API). A batch is created automatically when an import form is confirmed, one batch per import item, and it carries entry and expiry dates.
2. **export-form** (issue form). It mirrors import-form: DRAFT → CONFIRMED | CANCELLED. Confirming it reduces inventory and batches in one transaction. An item may name a batch; if it doesn't, the earliest-expiry batches are used (FEFO).

Decisions confirmed with the user:
- `status` = DRAFT/CONFIRMED/CANCELLED (same as import-form). `type` = PRODUCTION/DISPOSAL/TRANSFER/SALE/OTHER. The request had these two names the other way round.
- Import item gets an optional `expiryDate`. On import confirm, each item creates 1 batch: `entryDate = form.date`, `expiryDate = item.expiryDate`, `quantity = remaining = baseQuantity`.
- An item without a batch may need more than one batch. In that case confirm **splits the line** into several export items, each with its own `batch`.
- Legacy stock: a migration **backfills** batches from already-confirmed import items. On export, if the batches can't cover a line, the confirm fails with a clear error.

Export-form authorities already exist (`EXPORT_FORM_*`, incl. `EXPORT_FORM_APPROVE_DISPOSAL`, seeded in `1783728000012`), so **no new authority migration** is needed. Batch GET reuses `MATERIAL_READ + WAREHOUSE_READ`, the same pair inventory GET uses.

Error-code ranges: export-form `1014xx`, material-batch `1015xx`.

---

## 1. material-batch module — `src/material-batch/`

Files: `material-batch.entity.ts`, `.constants.ts`, `.dto.ts`, `.mapper.ts`, `.service.ts`, `.controller.ts`, `.module.ts`, `.exception.ts`, `.validation.ts`, plus specs.

**Entity `MaterialBatch` → `material_batch_tbl`, extends `Base`** (not versioned; writes use a pessimistic lock like `Inventory`):
| field | column | notes |
|---|---|---|
| `material` | `material_id_column` FK, not null | Material 1–n Batch |
| `warehouse` | `warehouse_id_column` FK, not null | **added**: FEFO is per warehouse. Without it, every lookup would need a join through item → form → warehouse |
| `importFormItem` | `import_form_item_id_column` FK, not null | Batch n–1 ImportFormItem |
| `entryDate` | `entry_date_column` `date` | = import form `date` |
| `expiryDate` | `expiry_date_column` `date` nullable | |
| `quantity` | decimal(18,6) | original base quantity, never changes |
| `remainingQuantity` | decimal(18,6) | decreased on export |
| `status` | `status_column` tinyint | `MaterialBatchStatus { OutOfStock = 0, InStock = 1 }`, kept in sync: `remaining > 0 ⇔ InStock` |

Index `(warehouse, material, status, expiryDate)` for the FEFO query.

**Service `MaterialBatchService`** (exported):
- `createFromImportItems(manager, form, items)`: builds and saves 1 batch per item inside the caller's transaction.
- `consume(manager, warehouseId, lines: { materialId; baseQuantity; batchId? }[]) → allocations[]`:
  - Lock with `pessimistic_write` and no relations, same pattern as `InventoryService.mutate`. Process materials sorted by id to avoid deadlocks.
  - **Explicit batch:** lock that batch, check it belongs to the same material/warehouse and has `remaining >= qty`, else `MATERIAL_BATCH_INSUFFICIENT`.
  - **No batch (FEFO):** lock in-stock batches of the material in this warehouse, ordered `expiryDate IS NULL, expiryDate ASC, entryDate ASC, createdAt ASC`. Take from each until the line is covered; still short ⇒ `MATERIAL_BATCH_INSUFFICIENT`.
  - Update `remainingQuantity`/`status`. Return `[{ lineRef, batch, baseQuantity }]`.
  - Explicit-batch lines are applied before FEFO lines, so FEFO can't take stock a line explicitly asked for.
- `findAll(warehouseSlug, query)`: paginated. Filters: `materialSlug`, `status`, `expiryBefore` (for near-expiry lists). `sortBy` = `expiryDate | entryDate | createdAt`, using `buildSortOrder`.
- `findOne(warehouseSlug, slug)`.

**Controller:** `GET /warehouses/:warehouseSlug/material-batches` and `GET .../material-batches/:slug`. Uses `@WarehouseScope('warehouseSlug')` and `@RequireAuthority(MaterialRead, WarehouseRead)`. No POST/PATCH/DELETE.

**Response DTO:** slug, entryDate, expiryDate, quantity, remainingQuantity, status, materialSlug/code/name, importFormSlug/code. This needs relations `material`, `importFormItem.importForm`, `withDeleted` for history.

## 2. Import-form changes — `src/import-form/`

- `import-form-item.entity.ts`: add `expiryDate?: string | null` (`expiry_date_column`, `date`, nullable), plus `@OneToMany` to batches (no cascade).
- `import-form.dto.ts`: `CreateImportFormItemDto.expiryDate?`, with `@Matches(IMPORT_FORM_DATE_REGEX)`. Add it to the item response DTO. New validation key `IMPORT_FORM_ITEM_EXPIRY_DATE_INVALID`. The service also rejects `expiryDate < form.date`.
- `import-form.service.ts` `buildItems`: copy `expiryDate`. In `decide()`, when Confirmed, call `materialBatchService.createFromImportItems(manager, form, items)` right after `inventoryService.receive(...)` in the same transaction.
- `import-form.module.ts`: import `MaterialBatchModule`.
- Update the import specs: confirm creates batches, and an invalid expiry is rejected.

## 3. Inventory change — `src/inventory/`

- `inventory.constants.ts`: add `InventoryHistoryAction.Export = 'EXPORT'`. The column is varchar, so no migration.
- `inventory.service.ts`: add `issue(manager, warehouseId, lines, actor, note)`. It mirrors `receive()`: group by material, lock rows in id order, call `mutate` with a negative `quantityDelta`. `mutate` already rejects negative stock and stock below reserved. A material not assigned to the warehouse gives `INVENTORY_NOT_FOUND`.

## 4. export-form module — `src/export-form/`

Built by copying the import-form structure (`/new-feature export-form`, then adapting from import-form). Reuse: `TransactionManagerService`, `pickDefined`, `roundToScale`, `buildSortOrder`/`escapeLike`/`resolveDateRange`/`toDateRangeOperator`, `S3Service`, `CustomFileInterceptor`, `WarehouseScope`, and the same `assertCanModify`/`assertCodeIsFree`/`findForm`/`decide` patterns.

**`ExportForm` → `export_form_tbl`, extends `VersionedBase`:**
`code` (unique), `type` (`ExportFormType` varchar(16)), `status` (`ExportFormStatus`, default DRAFT), `purchaseOrder` (required, as written in the request), `invoiceCode` (nullable), `requester` FK + `requesterName` snapshot, `approver` FK nullable + `approverName`, `receiver` (string), `totalAmount` decimal(18,2) (computed by the server), `note` text nullable, `file` varchar(1024) nullable, `warehouse` FK, and `items` (cascade soft-remove/recover only).

**`ExportFormItem` → `export_form_item_tbl`, extends `Base`:**
Same as `ImportFormItem` without the supplier snapshot: `lineNo`, material + code/name snapshot, unit + code/name snapshot, `quantity`, `conversionRate`, `baseQuantity`, `unitPrice`, `amount`, `note`, plus **`batch` FK nullable** (`batch_id_column`).
- There is no UNIQUE (form, material, unit), because split lines repeat it. Instead the service rejects duplicate `(material, unit, batchSlug)` in the request.

**DTOs:** `CreateExportFormRequestDto` (items use `batchSlug?`; response exposes `batchSlug`, never the id), `UpdateExportFormRequestDto extends PartialType(...)` + `version` with `@Min(1)`, `ChangeExportFormStatusRequestDto { version }`, `GetAllExportFormRequestDto` (filters status/type/code/invoiceCode/purchaseOrder/requesterSlug/approverSlug/date range), `ExportFormResponseDto extends VersionedResponseDto`. Mapper uses `versionedMapper()`.

**Building lines (create/PATCH)**, same as import `buildItems`:
- Material must be assigned to the warehouse.
- Unit must belong to the material.
- Snapshot the conversion rate.
- If `batchSlug` is given, it must exist in this warehouse, belong to the material, and be InStock.
- Stock is **not** checked or reserved on draft. Stock is checked at confirm, under lock.

**Confirm (`decide`)**, one transaction:
1. Lock the form, re-check DRAFT and version (copy of the import `decide`).
2. If `type === DISPOSAL`, the user also needs `EXPORT_FORM_APPROVE_DISPOSAL`. This is checked in the service because it depends on data; the route keeps `@RequireAuthority(ExportFormConfirm)`.
3. `materialBatchService.consume(...)` → allocations.
4. **Split lines:** a line with N allocations keeps the first allocation in the original row (sets `batch`). New rows are inserted for the rest. `quantity = alloc / conversionRate`, rounded, and the last piece gets the remainder of both `quantity` and `amount`, so the line totals and `totalAmount` stay exactly the same. Then renumber `lineNo`.
5. `inventoryService.issue(manager, warehouseId, lines, actor, 'Export form <code>')`.
6. Set status and approver, then save.

Cancel only changes status and approver. Nothing was reserved, so stock isn't touched.

**Controller:** `warehouses/:warehouseSlug/export-forms`. Routes: POST, `upload-file`, GET list, GET `:slug`, PATCH `:slug`, DELETE `:slug`, POST `:slug/confirm`, POST `:slug/cancel`. Authorities are the `EXPORT_FORM_*` counterparts of the import routes. PATCH/DELETE/upload use the service's OR check (full or `_OWN`).

**Errors (`1014xx`):** NOT_FOUND, CODE_*, TYPE_INVALID, RECEIVER_IS_REQUIRED, PURCHASE_ORDER_*, NOT_DRAFT, NOT_OWNER, WAREHOUSE_INACTIVE, ITEMS_*, ITEM_MATERIAL_NOT_FOUND / NOT_IN_WAREHOUSE, ITEM_UNIT_NOT_OF_MATERIAL, ITEM_BATCH_NOT_FOUND / NOT_OF_MATERIAL / OUT_OF_STOCK, ITEM_DUPLICATED, TOTAL_INVALID, FILE_TYPE_NOT_ALLOWED.

**material-batch (`1015xx`):** MATERIAL_BATCH_NOT_FOUND, MATERIAL_BATCH_INSUFFICIENT.

Register `MaterialBatchModule` and `ExportFormModule` in `src/app/app.module.ts`. Update the module list in `app/warehouse-api/CLAUDE.md`.

## 5. Migrations (`src/migrations/`, next numbers)

All migrations are **hand-written**: per CLAUDE.md, `typeorm:g` produces destructive diffs on this repo. Follow the pattern in `1783728000039/40-create-import-form*-table.ts`, with explicit FK/index names.
- `1783728000042-create-material-batch-table`
- `1783728000043-add-expiry-date-to-import-form-item`
- `1783728000044-create-export-form-tables` (form + item)
- `1783728000045-backfill-material-batches`: For every item of a CONFIRMED, non-deleted import form, insert a batch with entry = form date, expiry = NULL, quantity = remaining = baseQuantity, status = 1, and a random slug (`getRandomString`). `down` deletes those rows.
  - Caveat: stock added through assign/adjust has no batch. Batch remaining can also be higher than inventory if stock was adjusted down later. Export still fails safely, because both batch and inventory are checked.

I'll ask before running `npm run typeorm:r`, as `CLAUDE.md` requires.

## Verification

1. `npm run lint`, then `npm run test`. New specs:
   - material-batch: FEFO order (null expiry last); explicit-batch lines applied first; insufficient batches; status flips to 0.
   - export-form: create/PATCH/delete draft; disposal needs APPROVE_DISPOSAL; split line keeps the total; version-0 lock test in `export-form.dto.spec.ts`.
   - import-form: confirm creates batches.
   - inventory: `issue` rejects negative stock.
2. `npm run build`.
3. After approval: `npm run typeorm:r`, clear `rbac:*` in Redis, `npm run dev`. Then on Swagger:
   - Import with `expiryDate`, confirm, and check `GET .../material-batches`.
   - Create an export without `batchSlug` for more than one batch holds, confirm, and check the lines were split with batches set.
   - Check batch `remainingQuantity`/`status`, inventory quantity, and an `EXPORT` row in inventory history.
4. `npm run test:e2e` (new routes).

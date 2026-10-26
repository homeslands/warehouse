# Plan: export form PENDING status + batch reservation (WMS-20)

## Context

Draft export forms don't reserve anything. Several drafts could each pass validation and together promise more than a batch or the warehouse holds. Only confirm saw the shortage.

Decisions confirmed with the user:
- A new status `PENDING`, set by an explicit submit. Reservation happens **on submit**, not on draft create or edit.
- **No auto-expiry.** A reservation is released only when the form is cancelled.

## Flow

```
DRAFT --submit--> PENDING --confirm--> CONFIRMED
  |                  |
  +----cancel--------+-----cancel----> CANCELLED
```

Only `DRAFT` can be edited or deleted.

| Step | Batches | Inventory (history) |
|---|---|---|
| submit | `reserve`: FEFO or the chosen batch, using only `remaining - reserved`. Lines are split per batch | `reserve` (`RESERVE`); fails with `INVENTORY_AVAILABLE_INSUFFICIENT` if short |
| confirm | `consumeReserved`: `remaining -= q`, `reserved -= q` on the reserved batch | `issue(..., { fromReserved: true })` (`EXPORT`) |
| cancel from PENDING | `release`: `reserved -= q` | `release` (`RELEASE`) |

## Changes

- `material_batch_tbl.reserved_quantity_column` DECIMAL(18,6) DEFAULT 0. Migration `1783728000046`, written by hand.
- Batch response: `reservedQuantity`, `availableQuantity`.
- `MaterialBatchService.consume` is replaced by `reserve` / `consumeReserved` / `release`. All three share one lock-and-write helper, so the lock order is the same everywhere.
- `InventoryService`: `reserve`, `release`, and an `issue` option `fromReserved`. `receive`, `issue`, `reserve` and `release` share `applyPerMaterial`.
- Export form: `POST /warehouses/:warehouseSlug/export-forms/:slug/submit`. It has no `@RequireAuthority`; the service checks `EXPORT_FORM_UPDATE_DRAFT` OR `_OWN`, the same as PATCH. No new authority code, no seed migration.
- New errors: `EXPORT_FORM_NOT_PENDING` (101437), `EXPORT_FORM_CANNOT_BE_CANCELLED` (101438), `MATERIAL_BATCH_RESERVED_INVALID` (101505), `INVENTORY_AVAILABLE_INSUFFICIENT` (100817).

## Breaking for the frontend

- Confirm now requires `PENDING`. A `DRAFT` must call `/submit` first.
- Stock and batch shortages are now reported at submit time.

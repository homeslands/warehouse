import { PlusIcon } from 'lucide-react'
import { useCallback, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useSearchParams } from 'react-router-dom'
import { toCodeOrNameQuery } from '@/shared/lib/code'
import { useClampPage } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { SearchInput } from '@/shared/ui/data-table/SearchInput'
import { SelectFilter } from '@/shared/ui/data-table/SelectFilter'
import {
  useWarehouseInventory,
  type InventoryFilters,
  type MaterialAddAbilities,
} from '@/entities/inventory'
import { useMaterialTypeOptions } from '@/entities/material-type'
import { AddWarehouseMaterialDialog } from '@/features/warehouse-material-add'
import {
  RemoveWarehouseMaterialDialog,
  type RemovableMaterial,
} from '@/features/warehouse-material-remove'
import { buildInventoryColumns } from './inventory-columns'
import { InventoryHistorySheet } from './InventoryHistorySheet'

type Alert = '' | 'below' | 'above'

type Props = {
  warehouse: { slug: string; name: string; isActive: boolean }
  /** Quyền hộp thêm vật tư (`materialAddAbilities`); nút Thêm hiện khi `assign || create`. */
  addAbilities: MaterialAddAbilities
  canRemove: boolean
  /** `BACKEND_SUPPORTS.inventorySearch` — truyền vào để test bật được. */
  searchEnabled: boolean
}

/**
 * Tab "Vật tư" của trang chi tiết kho: `GET /warehouses/{w}/materials` + thêm / gỡ + sheet lịch sử (`?material=`).
 * Trang / bộ lọc ở state (như tab Vật tư của NCC) — URL chỉ giữ `?tab=` của trang và `?material=` của sheet.
 */
export function WarehouseInventory({ warehouse, addAbilities, canRemove, searchEnabled }: Props) {
  const { t } = useTranslation(['inventory', 'common'])
  const addHintId = useId()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [search, setSearch] = useState('')
  const [typeSlug, setTypeSlug] = useState('')
  const [alert, setAlert] = useState<Alert>('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<RemovableMaterial | null>(null)
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const backTo = location.pathname + location.search
  const viewingSlug = params.get('material')
  const setViewingSlug = useCallback(
    (slug: string | null) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (slug === null) next.delete('material')
          else next.set('material', slug)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  const filters: InventoryFilters = {
    typeSlug: typeSlug || undefined,
    belowMinimum: alert === 'below' ? true : undefined,
    aboveMaximum: alert === 'above' ? true : undefined,
    ...(searchEnabled ? toCodeOrNameQuery(search) : {}),
  }
  const { data, isPending, error, isPlaceholderData } = useWarehouseInventory(warehouse.slug, {
    page,
    size,
    ...filters,
  })
  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)
  const types = useMaterialTypeOptions()

  const columns = useMemo(
    () =>
      buildInventoryColumns(
        t,
        {
          canRemove,
          onViewHistory: (item) => setViewingSlug(item.materialSlug),
          onRemove: setRemoving,
        },
        backTo,
      ),
    [t, canRemove, setViewingSlug, backTo],
  )

  const filtered = typeSlug !== '' || alert !== '' || (searchEnabled && search.trim() !== '')
  const resetToFirst =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v)
      setPage(1)
    }
  const canAdd = addAbilities.assign || addAbilities.create

  return (
    <section className="space-y-3">
      <ListToolbar
        search={
          searchEnabled && (
            <SearchInput
              value={search}
              onChange={resetToFirst(setSearch)}
              placeholder={t('inventory:searchPlaceholder')}
            />
          )
        }
        filters={
          <>
            <SelectFilter
              label={t('inventory:filterType')}
              value={typeSlug}
              onChange={resetToFirst(setTypeSlug)}
              options={[
                { value: '', label: t('inventory:filterTypeAll') },
                ...(types.data?.items ?? []).map((x) => ({
                  value: x.slug,
                  label: `${x.code} · ${x.name}`,
                })),
              ]}
            />
            <SelectFilter
              label={t('inventory:filterAlert')}
              value={alert}
              onChange={(v) => resetToFirst(setAlert)(v as Alert)}
              options={[
                { value: '', label: t('inventory:alertAll') },
                { value: 'below', label: t('inventory:alertBelow') },
                { value: 'above', label: t('inventory:alertAbove') },
              ]}
            />
          </>
        }
        activeFilterCount={(typeSlug ? 1 : 0) + (alert ? 1 : 0)}
        onClearFilters={() => {
          setTypeSlug('')
          setAlert('')
          setPage(1)
        }}
        actions={
          canAdd && (
            <div className="flex flex-col items-end gap-1">
              <Button
                disabled={!warehouse.isActive}
                aria-describedby={warehouse.isActive ? undefined : addHintId}
                onClick={() => setAdding(true)}
              >
                <PlusIcon aria-hidden />
                <span className="max-md:sr-only">{t('inventory:addAction')}</span>
              </Button>
              {!warehouse.isActive && (
                <p id={addHintId} className="text-muted-foreground max-w-60 text-right text-xs">
                  {t('inventory:warehouseInactiveHint')}
                </p>
              )}
            </div>
          )
        }
      />
      <DataTable
        columns={columns}
        data={data?.items}
        isLoading={isPending}
        error={error}
        emptyText={filtered ? t('inventory:emptyFiltered') : t('inventory:empty')}
        onRowClick={(item) => setViewingSlug(item.materialSlug)}
        pagination={{
          page: data?.page ?? page,
          size,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          onPageChange: setPage,
          onSizeChange: (s) => {
            setSize(s)
            setPage(1)
          },
          isFetching: isPlaceholderData,
        }}
      />

      <InventoryHistorySheet
        warehouseSlug={warehouse.slug}
        materialSlug={viewingSlug}
        item={data?.items.find((i) => i.materialSlug === viewingSlug)}
        canRemove={canRemove}
        onRemove={(target) => setRemoving(target)}
        onOpenChange={(open) => !open && setViewingSlug(null)}
      />

      {canAdd && (
        <AddWarehouseMaterialDialog
          open={adding}
          onOpenChange={setAdding}
          warehouseSlug={warehouse.slug}
          initialSearch=""
          description={t('inventory:addFromWarehouseDescription', { warehouse: warehouse.name })}
          abilities={addAbilities}
          onAdded={() => {}}
        />
      )}
      {canRemove && (
        <RemoveWarehouseMaterialDialog
          warehouse={warehouse}
          item={removing}
          onOpenChange={(open) => !open && setRemoving(null)}
          onRemoved={(slug) => {
            if (viewingSlug === slug) setViewingSlug(null)
          }}
        />
      )}
    </section>
  )
}

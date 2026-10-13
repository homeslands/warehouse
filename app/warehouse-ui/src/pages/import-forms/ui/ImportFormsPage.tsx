import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useCallback, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { useClampPage, useListParams } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { SelectFilter } from '@/shared/ui/data-table/SelectFilter'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  IMPORT_FORM_STATUSES,
  buildImportFormColumns,
  useImportForms,
  type ImportForm,
  type ImportFormFilters,
} from '@/entities/import-form'
import { useAuthStore } from '@/entities/session'
import { DeleteImportFormDialog } from '@/features/import-form-delete'
import { WarehousePicker, useWarehouseSelection } from '@/features/warehouse-picker'
import { importFormAbilities } from '../model/abilities'
import { createPath, detailPath, editPath } from '../model/paths'

const FILTERS = z.object({
  warehouse: z.string().optional(),
  status: z.enum(IMPORT_FORM_STATUSES).optional(),
}) satisfies z.ZodType<{ warehouse?: string } & ImportFormFilters>

const DEFAULT_SORT = ['createdAt:DESC']

export function ImportFormsPage() {
  const { t } = useTranslation(['importForms', 'common'])
  const location = useLocation()
  const navigate = useNavigate()
  const hintId = useId()
  const user = useAuthStore((s) => s.user)
  const { page, size, filters, setPage, setSize, setFilters } = useListParams(FILTERS)
  const onResolve = useCallback((slug: string) => setFilters({ warehouse: slug }), [setFilters])
  const selection = useWarehouseSelection(filters.warehouse, onResolve)
  const warehouse = selection.warehouse
  const warehouseSlug = warehouse?.slug ?? ''
  const [deleting, setDeleting] = useState<ImportForm | null>(null)

  const backTo = location.pathname + location.search
  const detailLink = useCallback(
    (f: ImportForm) => ({ to: detailPath(f.warehouseSlug, f.slug), state: { backTo } }),
    [backTo],
  )

  const { data, isPending, error, isPlaceholderData } = useImportForms(warehouseSlug, {
    page,
    size,
    sort: DEFAULT_SORT,
    status: filters.status,
  })
  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)

  const pageAbility = importFormAbilities(user, { warehouseActive: warehouse?.isActive ?? false })
  const canCreateHere = importFormAbilities(user, { warehouseActive: true }).create

  const columns = useMemo<ColumnDef<ImportForm>[]>(() => {
    const actions: ColumnDef<ImportForm> = {
      id: 'actions',
      header: t('importForms:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => {
        const f = row.original
        const ability = importFormAbilities(user, { form: f, warehouseActive: true })
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('importForms:rowActions', { code: f.code })}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  const { to, state } = detailLink(f)
                  navigate(to, { state })
                }}
              >
                {t('importForms:viewDetail')}
              </DropdownMenuItem>
              {ability.update && (
                <DropdownMenuItem
                  onSelect={() =>
                    navigate(editPath(f.warehouseSlug, f.slug), { state: { backTo } })
                  }
                >
                  {t('importForms:editAction')}
                </DropdownMenuItem>
              )}
              {ability.delete && <DropdownMenuSeparator />}
              {ability.delete && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(f)}>
                  {t('importForms:deleteMenu')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }
    return [...buildImportFormColumns(t, { detailLink }), actions]
  }, [t, detailLink, navigate, user, backTo])

  const header = <h1 className="text-xl font-semibold">{t('importForms:title')}</h1>

  if (selection.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        {header}
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!selection.warehouses) {
    // Tải danh sách kho lỗi (mạng, 5xx) — chưa biết kho nào thì không dựng được bảng.
    return (
      <div className="space-y-4">
        {header}
        <p role="alert" className="bg-card rounded-xl border p-6 text-sm">
          {resolveApiErrorMessage(selection.error)}
        </p>
      </div>
    )
  }

  if (selection.warehouses.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <p className="bg-card text-muted-foreground rounded-xl border p-6 text-sm">
          {t('importForms:noWarehouse')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header}
        <WarehousePicker
          warehouses={selection.warehouses}
          value={warehouse?.slug}
          onChange={(slug) => setFilters({ warehouse: slug })}
        />
      </div>

      <ListToolbar
        filters={
          <SelectFilter
            label={t('importForms:filterStatus')}
            value={filters.status ?? ''}
            onChange={(value) =>
              setFilters({ status: value === '' ? undefined : (value as ImportForm['status']) })
            }
            options={[
              { value: '', label: t('importForms:statusAll') },
              ...IMPORT_FORM_STATUSES.map((s) => ({
                value: s,
                label: t(`importForms:status.${s}`),
              })),
            ]}
          />
        }
        activeFilterCount={filters.status ? 1 : 0}
        onClearFilters={() => setFilters({ status: undefined })}
        actions={
          canCreateHere &&
          warehouse && (
            <div className="flex flex-col items-end gap-1">
              <Button
                disabled={!pageAbility.create}
                aria-describedby={!warehouse.isActive ? hintId : undefined}
                onClick={() => navigate(createPath(warehouse.slug), { state: { backTo } })}
              >
                <PlusIcon aria-hidden />
                <span className="max-md:sr-only">{t('importForms:create')}</span>
              </Button>
              {!warehouse.isActive && (
                <p id={hintId} className="text-muted-foreground max-w-60 text-right text-xs">
                  {t('importForms:warehouseInactive')}
                </p>
              )}
            </div>
          )
        }
      />

      {warehouse && (
        <DataTable
          columns={columns}
          emptyText={filters.status ? t('importForms:emptyFiltered') : t('importForms:empty')}
          onRowClick={(row) => {
            const { to, state } = detailLink(row)
            navigate(to, { state })
          }}
          data={data?.items}
          isLoading={isPending}
          error={error}
          pagination={{
            page: data?.page ?? page,
            size,
            total: data?.total ?? 0,
            totalPages: data?.totalPages ?? 0,
            onPageChange: setPage,
            onSizeChange: setSize,
            isFetching: isPlaceholderData,
          }}
        />
      )}

      <DeleteImportFormDialog
        warehouseSlug={warehouseSlug}
        form={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </div>
  )
}

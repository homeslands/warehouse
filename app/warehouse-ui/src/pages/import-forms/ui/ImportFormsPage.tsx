import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { BACKEND_SUPPORTS } from '@/shared/api/backend-capabilities'
import { toCreatedRange } from '@/shared/lib/date-range'
import { sortToParam, useClampPage, useListParams } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { DateRangeFilter } from '@/shared/ui/data-table/DateRangeFilter'
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
import { ImportFormSheet } from '@/features/import-form-editor'
import { AddWarehouseMaterialDialog, materialAddAbilities } from '@/features/warehouse-material-add'
import { WarehousePicker, useWarehouseSelection } from '@/features/warehouse-picker'
import { importFormAbilities } from '../model/abilities'
import { detailPath } from '../model/paths'
import { toastSaveOutcome } from '../model/saveToast'

const FILTERS = z.object({
  warehouse: z.string().optional(),
  status: z.enum(IMPORT_FORM_STATUSES).optional(),
  // Ngày tạo. Sai định dạng trên URL → bỏ riêng khoá đó (`useListParams`).
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
}) satisfies z.ZodType<{ warehouse?: string } & ImportFormFilters>

/** Trường backend cho phép sắp xếp (cột khai `sortField` ở entity). Không có `importDate`. */
const IMPORT_FORM_SORT_FIELDS = ['createdAt', 'code'] as const

export function ImportFormsPage() {
  const { t } = useTranslation(['importForms', 'common'])
  const location = useLocation()
  const navigate = useNavigate()
  const hintId = useId()
  const user = useAuthStore((s) => s.user)
  const { page, size, filters, sort, setPage, setSize, setFilters, setSort } =
    useListParams(FILTERS)
  const onResolve = useCallback((slug: string) => setFilters({ warehouse: slug }), [setFilters])
  const selection = useWarehouseSelection(filters.warehouse, onResolve)
  const warehouse = selection.warehouse
  const warehouseSlug = warehouse?.slug ?? ''
  const [deleting, setDeleting] = useState<ImportForm | null>(null)
  // Sheet luôn mount (callback của mutation bị bỏ qua nếu unmount): `sheet` = đang mở ở chế độ nào.
  const [sheet, setSheet] = useState<{ open: boolean; formSlug?: string; formCode?: string }>({
    open: false,
  })
  // Lối tắt trên toast sống lâu hơn lần render tạo ra nó → đọc trạng thái sheet HIỆN TẠI qua ref.
  const sheetOpen = useRef(sheet.open)
  useEffect(() => {
    sheetOpen.current = sheet.open
  }, [sheet.open])

  const backTo = location.pathname + location.search
  const detailLink = useCallback(
    (f: ImportForm) => ({ to: detailPath(f.warehouseSlug, f.slug), state: { backTo } }),
    [backTo],
  )

  const { data, isPending, error, isPlaceholderData } = useImportForms(warehouseSlug, {
    page,
    size,
    status: filters.status,
    ...toCreatedRange(filters.startDate, filters.endDate),
    ...(BACKEND_SUPPORTS.importFormSort ? sortToParam(sort, IMPORT_FORM_SORT_FIELDS) : {}),
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
                  onSelect={() => setSheet({ open: true, formSlug: f.slug, formCode: f.code })}
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
  }, [t, detailLink, navigate, user])

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
      {header}

      <ListToolbar
        // Kho đứng đầu thanh lọc nhưng không tính vào "Bộ lọc (n)" / "Xoá bộ lọc": luôn phải có một kho.
        filters={
          <>
            <WarehousePicker
              warehouses={selection.warehouses}
              value={warehouse?.slug}
              onChange={(slug) => setFilters({ warehouse: slug })}
            />
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
            <DateRangeFilter
              label={t('importForms:filterCreatedAt')}
              value={{ from: filters.startDate, to: filters.endDate }}
              onChange={({ from, to }) => setFilters({ startDate: from, endDate: to })}
            />
          </>
        }
        activeFilterCount={
          [filters.status, filters.startDate || filters.endDate].filter(Boolean).length
        }
        onClearFilters={() =>
          setFilters({ status: undefined, startDate: undefined, endDate: undefined })
        }
        actions={
          canCreateHere &&
          warehouse && (
            <div className="flex flex-col items-end gap-1">
              <Button
                disabled={!pageAbility.create}
                aria-describedby={!warehouse.isActive ? hintId : undefined}
                onClick={() => setSheet({ open: true })}
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
          emptyText={
            filters.status || filters.startDate || filters.endDate
              ? t('importForms:emptyFiltered')
              : t('importForms:empty')
          }
          sorting={BACKEND_SUPPORTS.importFormSort ? { value: sort, onChange: setSort } : undefined}
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

      {warehouse && (
        <ImportFormSheet
          open={sheet.open}
          onOpenChange={(open) => setSheet((prev) => ({ ...prev, open }))}
          warehouseSlug={warehouse.slug}
          warehouseName={warehouse.name}
          formSlug={sheet.formSlug}
          formCode={sheet.formCode}
          materialAbilities={materialAddAbilities(user)}
          AddMaterialDialog={AddWarehouseMaterialDialog}
          canPickSupplier={pageAbility.pickSupplier}
          canConfirm={pageAbility.confirmOnSave}
          onSaved={(outcome) =>
            // "Xem" bấm khi sheet đang mở (đang nhập phiếu khác) → bỏ qua, không làm mất phần đang nhập mà không hỏi.
            toastSaveOutcome(t, outcome, sheet.formSlug === undefined, () => {
              if (sheetOpen.current) return
              navigate(detailPath(outcome.form.warehouseSlug, outcome.form.slug), {
                state: { backTo },
              })
            })
          }
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

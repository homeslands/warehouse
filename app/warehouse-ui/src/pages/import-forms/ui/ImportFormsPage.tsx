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
import { SearchInput } from '@/shared/ui/data-table/SearchInput'
import { SelectFilter } from '@/shared/ui/data-table/SelectFilter'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Skeleton } from '@/shared/ui/skeleton'
import {
  IMPORT_FORM_STATUSES,
  buildImportFormColumns,
  useImportForms,
  type ImportForm,
  type ImportFormFilters,
} from '@/entities/import-form'
import { can, useAuthStore } from '@/entities/session'
import { DeleteImportFormDialog } from '@/features/import-form-delete'
import { ImportFormSheet } from '@/features/import-form-editor'
import { AddWarehouseMaterialDialog, materialAddAbilities } from '@/features/warehouse-material-add'
import { WarehousePicker, useWarehouseSelection } from '@/features/warehouse-picker'
import { importFormAbilities } from '../model/abilities'
import { detailPath } from '../model/paths'
import {
  IMPORT_FORM_SEARCH_FIELDS,
  toImportFormSearchQuery,
  type ImportFormSearchField,
} from '../model/search-query'
import { toastSaveOutcome } from '../model/saveToast'
import { PersonFilter } from './PersonFilter'

const FILTERS = z.object({
  warehouse: z.string().optional(),
  status: z.enum(IMPORT_FORM_STATUSES).optional(),
  // `search` là chữ gõ; `searchBy` chọn khoá BE (mặc định `code`) — `toImportFormSearchQuery`.
  search: z.string().optional(),
  searchBy: z.enum(IMPORT_FORM_SEARCH_FIELDS).optional(),
  // Ngày tạo. Sai định dạng trên URL → bỏ riêng khoá đó (`useListParams`).
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  // Người lập / người xác nhận (slug). Khoá URL ngắn; sang BE thành `requesterSlug` / `approverSlug`.
  requester: z.string().optional(),
  approver: z.string().optional(),
}) satisfies z.ZodType<{ warehouse?: string; search?: string } & ImportFormFilters>

const SEARCH_BY_LABEL = {
  code: 'importForms:searchByCode',
  invoiceCode: 'importForms:searchByInvoice',
  purchaseOrder: 'importForms:searchByPurchaseOrder',
} as const satisfies Record<ImportFormSearchField, string>

const SEARCH_PLACEHOLDER = {
  code: 'importForms:searchPlaceholderCode',
  invoiceCode: 'importForms:searchPlaceholderInvoice',
  purchaseOrder: 'importForms:searchPlaceholderPurchaseOrder',
} as const satisfies Record<ImportFormSearchField, string>

/** Trường backend cho phép sắp xếp (cột khai `sortField` ở entity). Không có `importDate`. */
const IMPORT_FORM_SORT_FIELDS = ['createdAt', 'code'] as const

export function ImportFormsPage() {
  const { t } = useTranslation(['importForms', 'common'])
  const location = useLocation()
  const navigate = useNavigate()
  const hintId = useId()
  const warehousePickerId = useId()
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

  const searchBy = filters.searchBy ?? 'code'
  const { query: searchQuery, symbolOnly: symbolOnlySearch } = toImportFormSearchQuery(
    filters.search,
    filters.searchBy,
  )
  // Hai bộ lọc người cần `GET /users` (USER_READ). Không có quyền → không hiện và bỏ qua khoá trên URL.
  const canFilterByPerson = can(user, 'USER_READ')
  const requester = canFilterByPerson ? filters.requester : undefined
  const approver = canFilterByPerson ? filters.approver : undefined
  const { data, isPending, error, isPlaceholderData } = useImportForms(
    warehouseSlug,
    {
      page,
      size,
      status: filters.status,
      requesterSlug: requester,
      approverSlug: approver,
      ...searchQuery,
      ...toCreatedRange(filters.startDate, filters.endDate),
      ...(BACKEND_SUPPORTS.importFormSort ? sortToParam(sort, IMPORT_FORM_SORT_FIELDS) : {}),
    },
    // Ô tìm có chữ nhưng toàn ký tự BE không nhận: không gọi API, không liệt kê cả danh sách.
    { enabled: !symbolOnlySearch },
  )
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
      {/* Kho là ngữ cảnh của cả trang (không phải bộ lọc, không tính vào "Bộ lọc (n)"): đứng cạnh tiêu đề, mobile xuống hàng dưới. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {header}
        <div className="flex min-w-0 items-center gap-2 sm:max-w-[60%]">
          {/* Dấu ":" vẽ bằng CSS để tên khả truy cập của ô vẫn là "Kho". */}
          <label
            htmlFor={warehousePickerId}
            className="text-muted-foreground shrink-0 text-sm after:content-[':']"
          >
            {t('importForms:warehouse')}
          </label>
          <WarehousePicker
            id={warehousePickerId}
            warehouses={selection.warehouses}
            value={warehouse?.slug}
            onChange={(slug) => setFilters({ warehouse: slug })}
          />
        </div>
      </div>

      <ListToolbar
        search={
          <div className="flex w-full max-w-md items-center gap-2">
            <Select
              value={searchBy}
              // Giữ chữ đang gõ, đổi khoá tìm; `useListParams` tự về trang 1.
              onValueChange={(value) =>
                setFilters({
                  searchBy: value === 'code' ? undefined : (value as ImportFormSearchField),
                })
              }
            >
              <SelectTrigger aria-label={t('importForms:searchBy')} className="w-fit shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_FORM_SEARCH_FIELDS.map((field) => (
                  <SelectItem key={field} value={field}>
                    {t(SEARCH_BY_LABEL[field])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SearchInput
              className="min-w-0 flex-1"
              value={filters.search ?? ''}
              onChange={(value) => setFilters({ search: value === '' ? undefined : value })}
              placeholder={t(SEARCH_PLACEHOLDER[searchBy])}
            />
          </div>
        }
        filters={
          <>
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
            {canFilterByPerson && (
              <>
                <PersonFilter
                  label={t('importForms:filterRequester')}
                  value={requester}
                  onChange={(slug) => setFilters({ requester: slug })}
                />
                <PersonFilter
                  label={t('importForms:filterApprover')}
                  value={approver}
                  onChange={(slug) => setFilters({ approver: slug })}
                />
              </>
            )}
          </>
        }
        // Ô tìm không tính vào số (khớp MaterialsPage): nó đã hiện chữ ngay trên thanh, "Xoá bộ lọc" cũng không xoá nó (như mọi trang danh sách).
        activeFilterCount={
          [filters.status, filters.startDate || filters.endDate, requester, approver].filter(
            Boolean,
          ).length
        }
        onClearFilters={() =>
          setFilters({
            status: undefined,
            startDate: undefined,
            endDate: undefined,
            requester: undefined,
            approver: undefined,
          })
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
            filters.status ||
            filters.startDate ||
            filters.endDate ||
            filters.search ||
            requester ||
            approver
              ? t('importForms:emptyFiltered')
              : t('importForms:empty')
          }
          sorting={BACKEND_SUPPORTS.importFormSort ? { value: sort, onChange: setSort } : undefined}
          onRowClick={(row) => {
            const { to, state } = detailLink(row)
            navigate(to, { state })
          }}
          data={symbolOnlySearch ? [] : data?.items}
          isLoading={!symbolOnlySearch && isPending}
          error={symbolOnlySearch ? null : error}
          pagination={{
            page: symbolOnlySearch ? page : (data?.page ?? page),
            size,
            total: symbolOnlySearch ? 0 : (data?.total ?? 0),
            totalPages: symbolOnlySearch ? 0 : (data?.totalPages ?? 0),
            onPageChange: setPage,
            onSizeChange: setSize,
            isFetching: !symbolOnlySearch && isPlaceholderData,
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

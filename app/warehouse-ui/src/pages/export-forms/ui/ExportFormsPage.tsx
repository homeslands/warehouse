import type { ColumnDef } from '@tanstack/react-table'
import { ClockIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
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
  EXPORT_FORM_STATUSES,
  EXPORT_FORM_TYPES,
  buildExportFormColumns,
  useExportForms,
  usePendingExportFormCount,
  type ExportForm,
  type ExportFormFilters,
} from '@/entities/export-form'
import { can, useAuthStore } from '@/entities/session'
import { PersonFilter } from '@/entities/user'
import { DeleteExportFormDialog } from '@/features/export-form-delete'
import { ExportFormSheet } from '@/features/export-form-editor'
import { WarehousePicker, useWarehouseSelection } from '@/features/warehouse-picker'
import { exportFormAbilities } from '../model/abilities'
import { detailPath } from '../model/paths'
import {
  EXPORT_FORM_SEARCH_FIELDS,
  toExportFormSearchQuery,
  type ExportFormSearchField,
} from '../model/search-query'
import { toastExportSaveOutcome } from '../model/saveToast'

const FILTERS = z.object({
  warehouse: z.string().optional(),
  status: z.enum(EXPORT_FORM_STATUSES).optional(),
  type: z.enum(EXPORT_FORM_TYPES).optional(),
  // `search` là chữ gõ; `searchBy` chọn khoá BE (mặc định `code`) — `toExportFormSearchQuery`.
  search: z.string().optional(),
  searchBy: z.enum(EXPORT_FORM_SEARCH_FIELDS).optional(),
  // Ngày tạo. Sai định dạng trên URL → bỏ riêng khoá đó (`useListParams`).
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  // Người lập / người xác nhận (slug). Khoá URL ngắn; sang BE thành `requesterSlug` / `approverSlug`.
  requester: z.string().optional(),
  approver: z.string().optional(),
}) satisfies z.ZodType<{ warehouse?: string; search?: string } & ExportFormFilters>

const SEARCH_BY_LABEL = {
  code: 'exportForms:searchByCode',
  invoiceCode: 'exportForms:searchByInvoice',
  purchaseOrder: 'exportForms:searchByPurchaseOrder',
} as const satisfies Record<ExportFormSearchField, string>

const SEARCH_PLACEHOLDER = {
  code: 'exportForms:searchPlaceholderCode',
  invoiceCode: 'exportForms:searchPlaceholderInvoice',
  purchaseOrder: 'exportForms:searchPlaceholderPurchaseOrder',
} as const satisfies Record<ExportFormSearchField, string>

/** Trường BE cho phép sắp xếp (`sortBy=createdAt|code`); bảng chỉ khai `sortField` ở cột Mã. */
const EXPORT_FORM_SORT_FIELDS = ['createdAt', 'code'] as const

export function ExportFormsPage() {
  const { t } = useTranslation(['exportForms', 'common'])
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
  const [deleting, setDeleting] = useState<ExportForm | null>(null)
  // Sheet luôn mount (callback của mutation bị bỏ qua nếu unmount): `sheet` = đang mở ở chế độ nào.
  const [sheet, setSheet] = useState<{ open: boolean; formSlug?: string; formCode?: string }>({
    open: false,
  })
  // Lối tắt trên toast sống lâu hơn lần render tạo ra nó (và có toast bắn khi sheet còn mở — gửi duyệt lỗi sau khi
  // tạo) → đọc trạng thái sheet HIỆN TẠI qua ref.
  const sheetOpen = useRef(sheet.open)
  useEffect(() => {
    sheetOpen.current = sheet.open
  }, [sheet.open])

  const backTo = location.pathname + location.search
  const detailLink = useCallback(
    (f: ExportForm) => ({ to: detailPath(f.warehouseSlug, f.slug), state: { backTo } }),
    [backTo],
  )

  const searchBy = filters.searchBy ?? 'code'
  const { query: searchQuery, symbolOnly: symbolOnlySearch } = toExportFormSearchQuery(
    filters.search,
    filters.searchBy,
  )
  // Hai bộ lọc người cần `GET /users` (USER_READ). Không có quyền → không hiện và bỏ qua khoá trên URL.
  const canFilterByPerson = can(user, 'USER_READ')
  const requester = canFilterByPerson ? filters.requester : undefined
  const approver = canFilterByPerson ? filters.approver : undefined
  const { data, isPending, error, isPlaceholderData } = useExportForms(
    warehouseSlug,
    {
      page,
      size,
      status: filters.status,
      type: filters.type,
      requesterSlug: requester,
      approverSlug: approver,
      ...searchQuery,
      ...toCreatedRange(filters.startDate, filters.endDate),
      ...sortToParam(sort, EXPORT_FORM_SORT_FIELDS),
    },
    // Ô tìm có chữ nhưng toàn ký tự BE không nhận: không gọi API, không liệt kê cả danh sách.
    { enabled: !symbolOnlySearch },
  )
  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)

  const pageAbility = exportFormAbilities(user, { warehouseActive: warehouse?.isActive ?? false })
  const canCreateHere = exportFormAbilities(user, { warehouseActive: true }).create
  // Phiếu sheet sắp tạo là nháp của chính mình → quyền "Lưu & gửi duyệt" khi tạo = quyền gửi duyệt nháp của mình.
  const canSubmitNew = exportFormAbilities(user, {
    form: { status: 'DRAFT', requesterSlug: user?.userSlug ?? null, type: 'OTHER' },
    warehouseActive: true,
  }).submit
  // Nút nhanh "Chờ duyệt (n)" — chỉ cho người duyệt được (spec §4.1); số đếm là query riêng `size: 1`.
  const showPendingQuick = pageAbility.confirmOnSave
  const pendingCount = usePendingExportFormCount(warehouseSlug, { enabled: showPendingQuick })
  const pendingOnly = filters.status === 'PENDING'
  const pendingLabel =
    pendingCount === undefined
      ? t('exportForms:pendingQuick')
      : t('exportForms:pendingQuickCount', { count: pendingCount })

  const columns = useMemo<ColumnDef<ExportForm>[]>(() => {
    const actions: ColumnDef<ExportForm> = {
      id: 'actions',
      header: t('exportForms:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => {
        const f = row.original
        const ability = exportFormAbilities(user, { form: f, warehouseActive: true })
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('exportForms:rowActions', { code: f.code })}
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
                {t('exportForms:viewDetail')}
              </DropdownMenuItem>
              {ability.update && (
                <DropdownMenuItem
                  onSelect={() => setSheet({ open: true, formSlug: f.slug, formCode: f.code })}
                >
                  {t('exportForms:editAction')}
                </DropdownMenuItem>
              )}
              {ability.delete && <DropdownMenuSeparator />}
              {ability.delete && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(f)}>
                  {t('exportForms:deleteMenu')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }
    return [...buildExportFormColumns(t, { detailLink }), actions]
  }, [t, detailLink, navigate, user])

  const header = <h1 className="text-xl font-semibold">{t('exportForms:title')}</h1>

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
          {t('exportForms:noWarehouse')}
        </p>
      </div>
    )
  }

  const createButton = canCreateHere && warehouse && (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={!pageAbility.create}
        aria-describedby={!warehouse.isActive ? hintId : undefined}
        onClick={() => setSheet({ open: true })}
      >
        <PlusIcon aria-hidden />
        <span className="max-md:sr-only">{t('exportForms:create')}</span>
      </Button>
      {!warehouse.isActive && (
        <p id={hintId} className="text-muted-foreground max-w-60 text-right text-xs">
          {t('exportForms:warehouseInactive')}
        </p>
      )}
    </div>
  )

  // Lối tắt của bộ lọc trạng thái (cùng khoá `status` trên URL) — đứng ngoài `filters` để không bị gom vào popover.
  const pendingButton = showPendingQuick && (
    <Button
      variant={pendingOnly ? 'secondary' : 'outline'}
      aria-pressed={pendingOnly}
      onClick={() => setFilters({ status: pendingOnly ? undefined : 'PENDING' })}
    >
      <ClockIcon aria-hidden />
      <span className="max-md:sr-only">{pendingLabel}</span>
      {/* Mobile: chữ chỉ còn cho trình đọc màn hình; số vẫn hiện cạnh icon. */}
      {pendingCount !== undefined && (
        <span aria-hidden className="tabular-nums md:hidden">
          {pendingCount}
        </span>
      )}
    </Button>
  )

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
            {t('exportForms:warehouse')}
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
                  searchBy: value === 'code' ? undefined : (value as ExportFormSearchField),
                })
              }
            >
              <SelectTrigger aria-label={t('exportForms:searchBy')} className="w-fit shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_FORM_SEARCH_FIELDS.map((field) => (
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
              label={t('exportForms:filterStatus')}
              value={filters.status ?? ''}
              onChange={(value) =>
                setFilters({ status: value === '' ? undefined : (value as ExportForm['status']) })
              }
              options={[
                { value: '', label: t('exportForms:statusAll') },
                ...EXPORT_FORM_STATUSES.map((s) => ({
                  value: s,
                  label: t(`exportForms:status.${s}`),
                })),
              ]}
            />
            <SelectFilter
              label={t('exportForms:filterType')}
              value={filters.type ?? ''}
              onChange={(value) =>
                setFilters({ type: value === '' ? undefined : (value as ExportForm['type']) })
              }
              options={[
                { value: '', label: t('exportForms:typeAll') },
                ...EXPORT_FORM_TYPES.map((type) => ({
                  value: type,
                  label: t(`exportForms:type.${type}`),
                })),
              ]}
            />
            <DateRangeFilter
              label={t('exportForms:filterCreatedAt')}
              value={{ from: filters.startDate, to: filters.endDate }}
              onChange={({ from, to }) => setFilters({ startDate: from, endDate: to })}
            />
            {canFilterByPerson && (
              <>
                <PersonFilter
                  label={t('exportForms:filterRequester')}
                  value={requester}
                  onChange={(slug) => setFilters({ requester: slug })}
                />
                <PersonFilter
                  label={t('exportForms:filterApprover')}
                  value={approver}
                  onChange={(slug) => setFilters({ approver: slug })}
                />
              </>
            )}
          </>
        }
        // Ô tìm không tính vào số (như phiếu nhập); "Xoá bộ lọc" cũng không xoá nó.
        activeFilterCount={
          [
            filters.status,
            filters.type,
            filters.startDate || filters.endDate,
            requester,
            approver,
          ].filter(Boolean).length
        }
        onClearFilters={() =>
          setFilters({
            status: undefined,
            type: undefined,
            startDate: undefined,
            endDate: undefined,
            requester: undefined,
            approver: undefined,
          })
        }
        actions={
          (pendingButton || createButton) && (
            <div className="flex items-start gap-2">
              {pendingButton}
              {createButton}
            </div>
          )
        }
      />

      {warehouse && (
        <DataTable
          columns={columns}
          emptyText={
            filters.status ||
            filters.type ||
            filters.startDate ||
            filters.endDate ||
            filters.search ||
            requester ||
            approver
              ? t('exportForms:emptyFiltered')
              : t('exportForms:empty')
          }
          sorting={{ value: sort, onChange: setSort }}
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
        <ExportFormSheet
          open={sheet.open}
          onOpenChange={(open) => setSheet((prev) => ({ ...prev, open }))}
          warehouseSlug={warehouse.slug}
          warehouseName={warehouse.name}
          formSlug={sheet.formSlug}
          formCode={sheet.formCode}
          // Sửa chỉ mở được khi `update` — mà `update` đã bao gồm quyền gửi duyệt nháp đó.
          canSubmit={sheet.formSlug === undefined ? canSubmitNew : true}
          canConfirm={pageAbility.confirmOnSave}
          canApproveDisposal={pageAbility.approveDisposal}
          canReadWarehouses={pageAbility.readWarehouses}
          canPickBatch={pageAbility.pickBatch}
          onSaved={(outcome) =>
            // "Xem" bấm khi sheet đang mở (gửi duyệt lỗi, sheet ở lại; hoặc đang nhập phiếu khác) → bỏ qua, không làm
            // mất phần đang nhập mà không hỏi.
            toastExportSaveOutcome(t, outcome, sheet.formSlug === undefined, () => {
              if (sheetOpen.current) return
              navigate(detailPath(outcome.form.warehouseSlug, outcome.form.slug), {
                state: { backTo },
              })
            })
          }
        />
      )}

      <DeleteExportFormDialog
        warehouseSlug={warehouseSlug}
        form={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </div>
  )
}

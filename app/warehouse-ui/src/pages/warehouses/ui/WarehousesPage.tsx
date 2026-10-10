import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { BACKEND_SUPPORTS } from '@/shared/api/backend-capabilities'
import { sortToParam, useClampPage, useListParams } from '@/shared/lib/list-params'
import { toastApiError } from '@/shared/lib/toast-error'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { Combobox, type ComboboxOption } from '@/shared/ui/Combobox'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { SearchInput } from '@/shared/ui/data-table/SearchInput'
import { SelectFilter } from '@/shared/ui/data-table/SelectFilter'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemHint,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { Label } from '@/shared/ui/label'
import { useAuthStore, isWarehouseScoped } from '@/entities/session'
import { useManagerCandidates } from '@/entities/user'
import { formatPersonLabel } from '@/shared/lib/person-name'
import {
  buildWarehouseColumns,
  useDeleteWarehouse,
  useUpdateWarehouse,
  useWarehouses,
  type Warehouse,
  type WarehouseFilters,
} from '@/entities/warehouse'
import { AssignWarehouseManagerDialog } from '@/features/warehouse-assign-manager'
import { ToggleWarehouseActiveDialog } from '@/features/warehouse-toggle-active'
import { DeleteWarehouseDialog } from '@/features/warehouse-delete'
import { WarehouseFormSheet } from '@/features/warehouse-form'
import { warehouseAbilities } from '../model/abilities'

// Khai NGOÀI component (useListParams đọc `schema.shape` trong useMemo). `z.stringbool()` chứ không
// `z.coerce.boolean()` — cái sau hiểu chuỗi "false" là true. `satisfies` bắt lệch KIỂU giá trị so
// với bộ lọc của entity; tên khoá vẫn phải tự soát.
const FILTERS = z.object({
  isActive: z.stringbool().optional(),
  managerSlug: z.string().optional(),
  hasManager: z.stringbool().optional(),
  // Chỉ gửi đi khi BACKEND_SUPPORTS.search — xem shared/api/backend-capabilities.ts.
  search: z.string().optional(),
}) satisfies z.ZodType<WarehouseFilters>

/**
 * Ô lọc theo quản lý. Tách thành component riêng (chứ không gọi hook ở `WarehousesPage`) để hai
 * request `/roles` + `/users` chỉ chạy khi ô lọc thật sự hiện: `GET /users` là endpoint chỉ dành
 * cho ADMIN, MANAGER/SUPERVISOR gọi vào chỉ nhận 403 và một ô lọc chết.
 */
function ManagerFilter({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  const { t } = useTranslation(['warehouses'])
  const { candidates } = useManagerCandidates()

  const options: ComboboxOption[] = candidates.map((c) => ({
    value: c.slug,
    label: formatPersonLabel(c),
  }))
  // Giá trị trên URL có thể không nằm trong danh sách ứng viên (quản lý đã bị khoá, link người khác
  // gửi): vẫn phải hiện ra — nếu không ô lọc trông như đang trống mà danh sách thì vẫn bị lọc, và
  // không còn nút xoá để gỡ.
  if (value !== undefined && !options.some((option) => option.value === value)) {
    options.unshift({ value, label: value })
  }

  return (
    <Combobox
      aria-label={t('warehouses:managerFilter')}
      className="w-56"
      options={options}
      value={value}
      onChange={onChange}
      placeholder={t('warehouses:managerFilter')}
      emptyText={t('warehouses:noManagerCandidate')}
    />
  )
}

export function WarehousesPage() {
  const { t } = useTranslation(['warehouses', 'common'])
  const location = useLocation()
  // Gửi kèm link tới trang chi tiết: nút "Quay lại danh sách" ở đó đọc lại đúng trang/bộ lọc này.
  const backTo = location.pathname + location.search
  const navigate = useNavigate()
  // Link ở cột tên và cú bấm cả hàng dùng chung một đích, cùng mang `backTo`.
  const detailLink = useCallback(
    (w: Warehouse) => ({ to: `/warehouses/${w.slug}`, state: { backTo } }),
    [backTo],
  )
  const user = useAuthStore((s) => s.user)
  // Mỗi nút theo đúng thứ backend kiểm — vai trò hay mã quyền tuỳ cờ `authorityGuards`.
  const ability = warehouseAbilities(user, BACKEND_SUPPORTS)
  const hasRowActions = ability.update || ability.assignManager || ability.delete

  const { page, size, filters, sort, setPage, setSize, setFilters, setSort } =
    useListParams(FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Warehouse | undefined>(undefined)
  const [deleting, setDeleting] = useState<Warehouse | null>(null)
  const [togglingActive, setTogglingActive] = useState<Warehouse | null>(null)
  const [assigning, setAssigning] = useState<Warehouse | null>(null)

  // MANAGER: backend tự lọc `GET /warehouses` chỉ còn kho mình phụ trách và BỎ QUA `managerSlug` /
  // `hasManager` (`WMS-10-be(7)`) — nên không có công tắc "kho của tôi", không gọi `/warehouses/mine`,
  // và hai bộ lọc theo quản lý bị ẩn. Backend so vai trò bằng `hasRole(Manager)` KHÔNG miễn SUPER_ADMIN,
  // nên ở đây cũng so `roleName` trực tiếp, không dùng `hasRole` của FE (hàm đó cho SUPER_ADMIN qua).
  // MANAGER/SUPERVISOR: backend tự lọc theo kho của mình và bỏ qua `managerSlug`/`hasManager`.
  const scopedToOwnWarehouses = isWarehouseScoped(user?.roleName)

  // `search` và `sort` chỉ rời khỏi FE khi backend làm xong — xem backend-capabilities.
  const { search, managerSlug, hasManager, ...rest } = filters
  const { data, isPending, error, isPlaceholderData } = useWarehouses({
    page,
    size,
    ...rest,
    ...(scopedToOwnWarehouses ? {} : { managerSlug, hasManager }),
    ...(BACKEND_SUPPORTS.search && search !== undefined ? { search } : {}),
    sort: BACKEND_SUPPORTS.sort ? sortToParam(sort) : undefined,
  })
  const remove = useDeleteWarehouse()
  const update = useUpdateWarehouse()

  // Dữ liệu giữ chỗ là của trang khác — không dùng nó để tính trang hợp lệ.
  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)

  // PATCH partial: chỉ gửi `{ isActive }`, các field khác giữ nguyên. `useUpdateWarehouse` đặt
  // suppressErrorToast (form tự báo lỗi tại ô), nên lời gọi từ trang phải tự toast phần lỗi của mình.
  const updateMutate = update.mutate
  const setActive = useCallback(
    (warehouse: Warehouse, isActive: boolean, onSuccess?: () => void) =>
      updateMutate(
        { slug: warehouse.slug, input: { isActive } },
        { onSuccess, onError: toastApiError },
      ),
    [updateMutate],
  )

  const columns = useMemo<ColumnDef<Warehouse>[]>(() => {
    const base = buildWarehouseColumns(t, {
      detailLink,
    })
    // Không còn thao tác nào trên dòng → không dựng cột, thay vì một nút mở ra menu rỗng.
    if (!hasRowActions) return base

    const actions: ColumnDef<Warehouse> = {
      id: 'actions',
      header: t('warehouses:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => {
        const warehouse = row.original

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('warehouses:rowActions', { name: warehouse.name })}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ability.update && (
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(warehouse)
                    setFormOpen(true)
                  }}
                >
                  {t('warehouses:editAction')}
                </DropdownMenuItem>
              )}
              {ability.assignManager && (
                <DropdownMenuItem onSelect={() => setAssigning(warehouse)}>
                  {t('warehouses:assignManagerAction')}
                </DropdownMenuItem>
              )}
              {ability.update && (
                <DropdownMenuItem onSelect={() => setTogglingActive(warehouse)}>
                  {warehouse.isActive
                    ? t('warehouses:deactivateAction')
                    : t('warehouses:activateAction')}
                </DropdownMenuItem>
              )}
              {ability.delete && (ability.update || ability.assignManager) && (
                <DropdownMenuSeparator />
              )}
              {ability.delete && (
                <>
                  <DropdownMenuItem
                    variant="destructive"
                    // Backend từ chối xoá kho đang hoạt động (100517) — khoá sẵn và nói rõ lý do thay
                    // vì để người dùng bấm rồi ăn toast lỗi.
                    disabled={warehouse.isActive}
                    aria-describedby={
                      warehouse.isActive ? `delete-hint-${warehouse.slug}` : undefined
                    }
                    onSelect={() => setDeleting(warehouse)}
                  >
                    {t('warehouses:deleteAction')}
                  </DropdownMenuItem>
                  {warehouse.isActive && (
                    <DropdownMenuItemHint id={`delete-hint-${warehouse.slug}`}>
                      {t('warehouses:deleteNeedsInactive')}
                    </DropdownMenuItemHint>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }

    return [...base, actions]
  }, [ability.update, ability.assignManager, ability.delete, hasRowActions, t, detailLink])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('warehouses:title')}</h1>

      <ListToolbar
        onClearFilters={() =>
          setFilters({ isActive: undefined, managerSlug: undefined, hasManager: undefined })
        }
        activeFilterCount={
          [
            filters.isActive !== undefined,
            filters.managerSlug,
            filters.hasManager === false,
          ].filter(Boolean).length
        }
        search={
          BACKEND_SUPPORTS.search && (
            <SearchInput
              value={filters.search ?? ''}
              onChange={(value) => setFilters({ search: value === '' ? undefined : value })}
              placeholder={t('common:search')}
            />
          )
        }
        filters={
          <>
            <SelectFilter
              label={t('warehouses:columnStatus')}
              value={filters.isActive === undefined ? '' : String(filters.isActive)}
              onChange={(value) =>
                setFilters({ isActive: value === '' ? undefined : value === 'true' })
              }
              options={[
                { value: '', label: t('warehouses:statusAll') },
                { value: 'true', label: t('warehouses:active') },
                { value: 'false', label: t('warehouses:inactive') },
              ]}
            />
            {ability.filterByManager && !scopedToOwnWarehouses && (
              <ManagerFilter
                value={filters.managerSlug}
                // Backend BỎ QUA `hasManager` khi đã có `managerSlug` — để cả hai cùng bật thì
                // giao diện nói một đằng, kết quả một nẻo. Chọn cái này là bỏ cái kia.
                onChange={(value) => setFilters({ managerSlug: value, hasManager: undefined })}
              />
            )}
            {!scopedToOwnWarehouses && (
              <Label className="text-sm font-normal">
                <Checkbox
                  checked={filters.hasManager === false}
                  onCheckedChange={(checked) =>
                    setFilters({
                      hasManager: checked ? false : undefined,
                      managerSlug: undefined,
                    })
                  }
                />
                {t('warehouses:onlyWithoutManager')}
              </Label>
            )}
          </>
        }
        actions={
          ability.create && (
            <Button
              onClick={() => {
                setEditing(undefined)
                setFormOpen(true)
              }}
            >
              <PlusIcon aria-hidden />
              {/* Mobile: chỉ còn dấu ＋ để ô tìm cùng hàng không bị cắt chữ; tên nút vẫn đọc được. */}
              <span className="max-md:sr-only">{t('warehouses:create')}</span>
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        onRowClick={(row) => {
          const { to, state } = detailLink(row)
          navigate(to, { state })
        }}
        data={data?.items}
        isLoading={isPending}
        error={error}
        emptyText={scopedToOwnWarehouses ? t('warehouses:mineEmpty') : undefined}
        sorting={BACKEND_SUPPORTS.sort ? { value: sort, onChange: setSort } : undefined}
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

      <WarehouseFormSheet open={formOpen} onOpenChange={setFormOpen} warehouse={editing} />

      {/* Chỉ mount khi có quyền gán (mục menu cũng nằm sau cờ đó) — để `useManagerCandidates` bên
          trong không gọi `/users` cho người không có quyền đọc danh sách người dùng. */}
      {ability.assignManager && (
        <AssignWarehouseManagerDialog
          warehouse={assigning}
          onOpenChange={(open) => !open && setAssigning(null)}
        />
      )}

      <ToggleWarehouseActiveDialog
        warehouse={togglingActive}
        onOpenChange={(open) => !open && setTogglingActive(null)}
        isPending={update.isPending}
        onConfirm={(warehouse) =>
          setActive(warehouse, !warehouse.isActive, () => setTogglingActive(null))
        }
      />

      <DeleteWarehouseDialog
        warehouse={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        isPending={remove.isPending}
        onConfirm={(slug) => remove.mutate(slug, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  )
}

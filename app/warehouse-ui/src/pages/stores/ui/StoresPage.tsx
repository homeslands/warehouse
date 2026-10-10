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
import { useAuthStore, isWarehouseScoped } from '@/entities/session'
import {
  buildStoreColumns,
  useDeleteStore,
  useStores,
  useUpdateStore,
  type Store,
  type StoreFilters,
} from '@/entities/store'
import { AssignStoreWarehouseDialog } from '@/features/store-assign-warehouse'
import { ToggleStoreActiveDialog } from '@/features/store-toggle-active'
import { DeleteStoreDialog } from '@/features/store-delete'
import { StoreFormSheet } from '@/features/store-form'
import { storeAbilities } from '../model/abilities'

// Backend `GET /stores` mới chỉ nhận `isActive` — chưa lọc theo kho, chưa tìm theo tên/mã.
const FILTERS = z.object({
  isActive: z.stringbool().optional(),
  // Chỉ gửi đi khi BACKEND_SUPPORTS.search — xem shared/api/backend-capabilities.ts.
  search: z.string().optional(),
}) satisfies z.ZodType<StoreFilters>

export function StoresPage() {
  const { t } = useTranslation(['stores', 'common'])
  const location = useLocation()
  // Gửi kèm link tới trang chi tiết: nút "Quay lại danh sách" ở đó đọc lại đúng trang/bộ lọc này.
  const backTo = location.pathname + location.search
  const navigate = useNavigate()
  // Link ở cột tên và cú bấm cả hàng dùng chung một đích, cùng mang `backTo`.
  const detailLink = useCallback(
    (s: Store) => ({ to: `/stores/${s.slug}`, state: { backTo } }),
    [backTo],
  )
  const user = useAuthStore((s) => s.user)
  // Mỗi nút theo đúng thứ backend kiểm — vai trò hay mã quyền tuỳ cờ trong BACKEND_SUPPORTS.
  const ability = storeAbilities(user, BACKEND_SUPPORTS)
  const hasRowActions = ability.update || ability.assignWarehouse || ability.delete

  const { page, size, filters, sort, setPage, setSize, setFilters, setSort } =
    useListParams(FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Store | undefined>(undefined)
  const [deleting, setDeleting] = useState<Store | null>(null)
  const [togglingActive, setTogglingActive] = useState<Store | null>(null)
  const [assigning, setAssigning] = useState<Store | null>(null)

  // `search` và `sort` chỉ rời khỏi FE khi backend làm xong — xem backend-capabilities.
  const { search, ...backendFilters } = filters
  const { data, isPending, error, isPlaceholderData } = useStores({
    page,
    size,
    ...backendFilters,
    ...(BACKEND_SUPPORTS.search && search !== undefined ? { search } : {}),
    sort: BACKEND_SUPPORTS.sort ? sortToParam(sort) : undefined,
  })
  const remove = useDeleteStore()
  const update = useUpdateStore()

  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)

  const assignedWarehouseSlugs = useMemo(
    () => (data?.items ?? []).flatMap((item) => (item.warehouseSlug ? [item.warehouseSlug] : [])),
    [data],
  )

  // PATCH partial: chỉ gửi `{ isActive }`. `useUpdateStore` đặt suppressErrorToast (form tự báo lỗi
  // tại ô) nên lời gọi từ trang phải tự toast phần lỗi của mình.
  const updateMutate = update.mutate
  const setActive = useCallback(
    (store: Store, isActive: boolean, onSuccess?: () => void) =>
      updateMutate(
        { slug: store.slug, input: { isActive } },
        { onSuccess, onError: toastApiError },
      ),
    [updateMutate],
  )

  const columns = useMemo<ColumnDef<Store>[]>(() => {
    const base = buildStoreColumns(t, {
      detailLink,
    })
    // Không còn thao tác nào trên dòng → không dựng cột, thay vì một nút mở ra menu rỗng.
    if (!hasRowActions) return base

    const actions: ColumnDef<Store> = {
      id: 'actions',
      header: t('stores:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => {
        const store = row.original

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('stores:rowActions', { name: store.name })}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {ability.update && (
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(store)
                    setFormOpen(true)
                  }}
                >
                  {t('stores:editAction')}
                </DropdownMenuItem>
              )}
              {ability.assignWarehouse && (
                <DropdownMenuItem onSelect={() => setAssigning(store)}>
                  {t('stores:assignWarehouseAction')}
                </DropdownMenuItem>
              )}
              {ability.update && (
                <DropdownMenuItem onSelect={() => setTogglingActive(store)}>
                  {store.isActive ? t('stores:deactivateAction') : t('stores:activateAction')}
                </DropdownMenuItem>
              )}
              {ability.delete && (ability.update || ability.assignWarehouse) && (
                <DropdownMenuSeparator />
              )}
              {ability.delete && (
                <>
                  <DropdownMenuItem
                    variant="destructive"
                    // Backend từ chối xoá cửa hàng đang hoạt động (101016).
                    disabled={store.isActive}
                    aria-describedby={store.isActive ? `delete-hint-${store.slug}` : undefined}
                    onSelect={() => setDeleting(store)}
                  >
                    {t('stores:deleteAction')}
                  </DropdownMenuItem>
                  {store.isActive && (
                    <DropdownMenuItemHint id={`delete-hint-${store.slug}`}>
                      {t('stores:deleteNeedsInactive')}
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
  }, [ability.update, ability.assignWarehouse, ability.delete, hasRowActions, t, detailLink])

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('stores:title')}</h1>

      <ListToolbar
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
              label={t('stores:columnStatus')}
              value={filters.isActive === undefined ? '' : String(filters.isActive)}
              onChange={(value) =>
                setFilters({ isActive: value === '' ? undefined : value === 'true' })
              }
              options={[
                { value: '', label: t('stores:statusAll') },
                { value: 'true', label: t('stores:active') },
                { value: 'false', label: t('stores:inactive') },
              ]}
            />
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
              <span className="max-md:sr-only">{t('stores:create')}</span>
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        // MANAGER: backend chỉ trả cửa hàng gắn với kho mình phụ trách (`WMS-10-be(7)`).
        emptyText={isWarehouseScoped(user?.roleName) ? t('stores:mineEmpty') : undefined}
        onRowClick={(row) => {
          const { to, state } = detailLink(row)
          navigate(to, { state })
        }}
        data={data?.items}
        isLoading={isPending}
        error={error}
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

      <StoreFormSheet open={formOpen} onOpenChange={setFormOpen} store={editing} />

      <AssignStoreWarehouseDialog
        store={assigning}
        // Chỉ biết được từ trang dữ liệu đang có — kho bị cửa hàng ở trang khác chiếm vẫn lọt vào
        // danh sách, và backend sẽ trả 101019. Đó là lý do lỗi đó hiện ngay tại ô chọn.
        assignedWarehouseSlugs={assignedWarehouseSlugs}
        onOpenChange={(open) => !open && setAssigning(null)}
      />

      <ToggleStoreActiveDialog
        store={togglingActive}
        onOpenChange={(open) => !open && setTogglingActive(null)}
        isPending={update.isPending}
        onConfirm={(store) => setActive(store, !store.isActive, () => setTogglingActive(null))}
      />

      <DeleteStoreDialog
        store={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        isPending={remove.isPending}
        onConfirm={(slug) => remove.mutate(slug, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  )
}

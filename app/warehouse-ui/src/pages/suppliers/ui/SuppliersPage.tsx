import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { BACKEND_SUPPORTS } from '@/shared/api/backend-capabilities'
import { sortToParam, useClampPage, useListParams } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { SearchInput } from '@/shared/ui/data-table/SearchInput'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import { useAuthStore } from '@/entities/session'
import {
  buildSupplierColumns,
  useSuppliers,
  type Supplier,
  type SupplierFilters,
} from '@/entities/supplier'
import { DeleteSupplierDialog } from '@/features/supplier-delete'
import { SupplierFormSheet } from '@/features/supplier-form'
import { supplierAbilities } from '../model/abilities'
import {
  isAmbiguousSupplierSearch,
  supplierSearchField,
  toSupplierSearchQuery,
  type SupplierSearchField,
} from '../model/search-query'

// Trên URL chỉ có chữ người dùng gõ (+ lựa chọn MST/SĐT cho 10 chữ số); tham số backend suy ra lúc gọi.
// Chỉ gửi đi khi BACKEND_SUPPORTS.supplierSearch — xem shared/api/backend-capabilities.ts.
const FILTERS = z.object({
  search: z.string().optional(),
  searchBy: z.enum(['taxCode', 'phonenumber']).optional(),
}) satisfies z.ZodType<Pick<SupplierFilters, 'search'>>

const SEARCH_EMPTY = {
  search: 'suppliers:searchEmptySearch',
  code: 'suppliers:searchEmptyCode',
  taxCode: 'suppliers:searchEmptyTaxCode',
  phonenumber: 'suppliers:searchEmptyPhonenumber',
} as const satisfies Record<SupplierSearchField, string>

export function SuppliersPage() {
  const { t } = useTranslation(['suppliers', 'common'])
  const location = useLocation()
  // Gửi kèm link tới trang chi tiết: nút "Quay lại danh sách" ở đó đọc lại đúng trang/bộ lọc này.
  const backTo = location.pathname + location.search
  const navigate = useNavigate()
  const detailLink = useCallback(
    (s: Supplier) => ({ to: `/suppliers/${s.slug}`, state: { backTo } }),
    [backTo],
  )
  const user = useAuthStore((s) => s.user)
  const ability = supplierAbilities(user, BACKEND_SUPPORTS)

  const { page, size, filters, sort, setPage, setSize, setFilters, setSort } =
    useListParams(FILTERS)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | undefined>(undefined)
  const [deleting, setDeleting] = useState<Supplier | null>(null)

  const searchQuery = ability.search ? toSupplierSearchQuery(filters.search, filters.searchBy) : {}
  const searchField = supplierSearchField(searchQuery)
  const { data, isPending, error, isPlaceholderData } = useSuppliers({
    page,
    size,
    sort: ability.sort ? sortToParam(sort) : undefined,
    ...searchQuery,
  })

  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)

  const columns = useMemo<ColumnDef<Supplier>[]>(() => {
    const actions: ColumnDef<Supplier> = {
      id: 'actions',
      header: t('suppliers:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => {
        const supplier = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('suppliers:rowActions', { name: supplier.name })}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  const { to, state } = detailLink(supplier)
                  navigate(to, { state })
                }}
              >
                {t('suppliers:viewDetail')}
              </DropdownMenuItem>
              {ability.update && (
                <DropdownMenuItem
                  onSelect={() => {
                    setEditing(supplier)
                    setFormOpen(true)
                  }}
                >
                  {t('suppliers:editAction')}
                </DropdownMenuItem>
              )}
              {ability.delete && <DropdownMenuSeparator />}
              {ability.delete && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(supplier)}>
                  {t('suppliers:deleteMenu')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }
    return [...buildSupplierColumns(t, { detailLink }), actions]
  }, [ability.update, ability.delete, t, detailLink, navigate])

  // Đang tìm mà trống: nói rõ đã tìm theo trường nào; 10 chữ số thì cho đổi MST ↔ SĐT (đoán có thể sai).
  let emptyText: ReactNode = t('suppliers:empty')
  if (searchField !== undefined) {
    const other = searchField === 'taxCode' ? 'phonenumber' : 'taxCode'
    emptyText = (
      <>
        {t(SEARCH_EMPTY[searchField], { value: searchQuery[searchField] })}
        {isAmbiguousSupplierSearch(filters.search) && (
          <>
            {' '}
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => setFilters({ searchBy: other })}
            >
              {other === 'taxCode'
                ? t('suppliers:searchAsTaxCode')
                : t('suppliers:searchAsPhonenumber')}
            </Button>
          </>
        )}
      </>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t('suppliers:title')}</h1>

      <ListToolbar
        search={
          ability.search && (
            <SearchInput
              value={filters.search ?? ''}
              // Gõ lại = đoán lại từ đầu: bỏ lựa chọn MST/SĐT của lần tìm trước.
              onChange={(value) =>
                setFilters({ search: value === '' ? undefined : value, searchBy: undefined })
              }
              placeholder={t('suppliers:searchPlaceholder')}
            />
          )
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
              {/* Mobile: chỉ còn dấu ＋; tên nút vẫn đọc được. */}
              <span className="max-md:sr-only">{t('suppliers:create')}</span>
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        emptyText={emptyText}
        sorting={ability.sort ? { value: sort, onChange: setSort } : undefined}
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

      {/* Luôn mount, điều khiển bằng state: callback của mutation bị bỏ qua nếu hộp unmount. */}
      <SupplierFormSheet open={formOpen} onOpenChange={setFormOpen} supplier={editing} />
      <DeleteSupplierDialog
        supplier={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </div>
  )
}

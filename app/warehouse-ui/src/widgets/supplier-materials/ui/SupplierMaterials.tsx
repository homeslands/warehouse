import type { CellContext, ColumnDef } from '@tanstack/react-table'
import { MoreHorizontalIcon, PackageMinusIcon, PlusIcon } from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { Checkbox } from '@/shared/ui/checkbox'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { DateRangeFilter, type DateRangeValue } from '@/shared/ui/data-table/DateRangeFilter'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { SearchInput } from '@/shared/ui/data-table/SearchInput'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'
import {
  buildSupplierMaterialColumns,
  toTransactionRange,
  useSupplierMaterials,
  type SupplierMaterial,
} from '@/entities/supplier'
import { AttachSupplierMaterialDialog } from '@/features/supplier-material-attach'
import { DetachSupplierMaterialDialog } from '@/features/supplier-material-detach'
import { toMaterialSearchQuery } from '../model/search-query'

/**
 * Trạng thái chọn cho cột ô tick. Ô tick là component CỐ ĐỊNH đọc qua context: `flexRender` coi mỗi hàm
 * `header`/`cell` inline là một component — mảng cột dựng lại mỗi lần chọn sẽ remount ô tick và mất focus (bàn
 * phím tick bằng Space xong không tick tiếp được).
 */
type Selection = {
  isSelected: (slug: string) => boolean
  toggle: (slug: string) => void
  /** Ô "chọn tất cả": true / false / chọn một phần. */
  allState: boolean | 'indeterminate'
  toggleAll: () => void
  empty: boolean
}
const SelectionContext = createContext<Selection | null>(null)

function SelectAllHeader() {
  const { t } = useTranslation(['suppliers'])
  const selection = useContext(SelectionContext)
  if (!selection) return null
  return (
    <Checkbox
      aria-label={t('suppliers:selectAllOnPage')}
      checked={selection.allState}
      onCheckedChange={selection.toggleAll}
      disabled={selection.empty}
    />
  )
}

function SelectCell({ row }: CellContext<SupplierMaterial, unknown>) {
  const { t } = useTranslation(['suppliers'])
  const selection = useContext(SelectionContext)
  if (!selection) return null
  return (
    <Checkbox
      aria-label={t('suppliers:selectMaterialAria', { code: row.original.code })}
      checked={selection.isSelected(row.original.slug)}
      onCheckedChange={() => selection.toggle(row.original.slug)}
    />
  )
}

type Props = {
  supplier: { slug: string; code: string }
  /** Có gắn/gỡ vật tư không. `false` → không nút Gắn, không cột chọn, không cột thao tác. */
  canManage: boolean
  /** Có ô tìm (mã / tên) + khoảng ngày tạo vật tư không — backend `supplierMaterialFilters`. */
  canFilter: boolean
}

/**
 * Tab "Vật tư" của trang chi tiết nhà cung cấp: `GET /suppliers/{slug}/materials` + gắn/gỡ.
 *
 * Bộ lọc giữ ở state của tab, KHÔNG lên URL: tab Giao dịch đã dùng `page` / `startDate` / `endDate` trên cùng URL.
 * Gỡ nhiều: tick các dòng của TRANG đang xem rồi "Gỡ (n)" (BE nhận lô ≤ 100, trang ≤ 50 dòng); đổi trang / số dòng /
 * bộ lọc thì bỏ chọn — lựa chọn không vắt qua những dòng người dùng không còn thấy.
 */
export function SupplierMaterials({ supplier, canManage, canFilter }: Props) {
  const { t } = useTranslation(['suppliers', 'common'])
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<DateRangeValue>({})
  const [attaching, setAttaching] = useState(false)
  const [detaching, setDetaching] = useState<SupplierMaterial[] | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const clearSelection = () => setSelected(new Set())

  const searchQuery = canFilter ? toMaterialSearchQuery(search) : {}
  const hasRange = canFilter && Boolean(range.from || range.to)
  const { data, isPending, error, isPlaceholderData } = useSupplierMaterials(supplier.slug, {
    page,
    size,
    ...searchQuery,
    ...(canFilter ? toTransactionRange(range.from, range.to) : {}),
  })

  // Đang lọc mà trống: nói rõ tìm theo gì. Lọc cả ngày thì câu chung (câu riêng sẽ bỏ sót điều kiện ngày).
  let emptyText = t('suppliers:noMaterials')
  if (hasRange) emptyText = t('common:noResults')
  else if (searchQuery.code)
    emptyText = t('suppliers:materialSearchEmptyCode', { value: searchQuery.code })
  else if (searchQuery.name)
    emptyText = t('suppliers:materialSearchEmptyName', { value: searchQuery.name })

  // Gỡ dòng cuối của trang cuối → trang hiện tại không còn: kéo về trang cuối còn lại.
  const totalPages = data?.totalPages
  useEffect(() => {
    if (totalPages !== undefined && page > Math.max(1, totalPages)) setPage(Math.max(1, totalPages))
  }, [totalPages, page])

  const items = data?.items ?? []
  // Chỉ tính dòng đang hiện — dữ liệu tải lại (người khác gỡ) không để sót slug "ma" trong lô gửi đi.
  const selectedRows = items.filter((m) => selected.has(m.slug))
  const allSelected = items.length > 0 && selectedRows.length === items.length
  const selection: Selection = {
    isSelected: (slug) => selected.has(slug),
    toggle: (slug) => {
      const next = new Set(selected)
      if (!next.delete(slug)) next.add(slug)
      setSelected(next)
    },
    allState: allSelected ? true : selectedRows.length > 0 ? 'indeterminate' : false,
    toggleAll: () => setSelected(allSelected ? new Set() : new Set(items.map((m) => m.slug))),
    empty: items.length === 0,
  }

  // Mảng cột ổn định giữa các lần render (không phụ thuộc lựa chọn) — xem `SelectionContext`.
  const columns = useMemo<ColumnDef<SupplierMaterial>[]>(() => {
    const base = buildSupplierMaterialColumns(t)
    if (!canManage) return base
    const select: ColumnDef<SupplierMaterial> = {
      id: 'select',
      header: SelectAllHeader,
      cell: SelectCell,
    }
    const actions: ColumnDef<SupplierMaterial> = {
      id: 'actions',
      header: t('suppliers:actions'),
      meta: { compactHeader: true },
      // Cùng dạng với mọi bảng khác: thao tác trên dòng nằm trong menu ⋯.
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('suppliers:rowActions', { name: row.original.code })}
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={() => setDetaching([row.original])}>
              {t('suppliers:detachMenu')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    }
    return [select, ...base, actions]
  }, [t, canManage])

  return (
    <section className="space-y-3">
      {(canManage || canFilter) && (
        <ListToolbar
          search={
            canFilter && (
              <SearchInput
                value={search}
                onChange={(value) => {
                  setSearch(value)
                  setPage(1)
                  clearSelection()
                }}
                placeholder={t('suppliers:materialSearchPlaceholder')}
              />
            )
          }
          filters={
            canFilter && (
              <DateRangeFilter
                label={t('suppliers:filterMaterialCreatedAt')}
                value={range}
                onChange={(value) => {
                  setRange(value)
                  setPage(1)
                  clearSelection()
                }}
              />
            )
          }
          activeFilterCount={hasRange ? 1 : 0}
          onClearFilters={() => {
            setRange({})
            setPage(1)
            clearSelection()
          }}
          actions={
            canManage && (
              <div className="flex items-center gap-2">
                {selectedRows.length > 0 && (
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDetaching(selectedRows)}
                  >
                    <PackageMinusIcon aria-hidden />
                    {t('suppliers:detachSelected', { count: selectedRows.length })}
                  </Button>
                )}
                <Button onClick={() => setAttaching(true)}>
                  <PlusIcon aria-hidden />
                  {/* Mobile: chỉ còn dấu ＋; tên nút vẫn đọc được. */}
                  <span className="max-md:sr-only">{t('suppliers:attachMaterial')}</span>
                </Button>
              </div>
            )
          }
        />
      )}
      <SelectionContext.Provider value={selection}>
        <DataTable
          columns={columns}
          data={data?.items}
          isLoading={isPending}
          error={error}
          emptyText={emptyText}
          pagination={{
            page: data?.page ?? page,
            size,
            total: data?.total ?? 0,
            totalPages: data?.totalPages ?? 0,
            onPageChange: (next) => {
              setPage(next)
              clearSelection()
            },
            onSizeChange: (next) => {
              setSize(next)
              clearSelection()
            },
            isFetching: isPlaceholderData,
          }}
        />
      </SelectionContext.Provider>
      {canManage && (
        <>
          <AttachSupplierMaterialDialog
            supplier={attaching ? supplier : null}
            onOpenChange={(open) => !open && setAttaching(false)}
          />
          <DetachSupplierMaterialDialog
            supplier={supplier}
            materials={detaching}
            onOpenChange={(open) => !open && setDetaching(null)}
            onDetached={clearSelection}
          />
        </>
      )}
    </section>
  )
}

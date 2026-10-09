import type { ColumnDef } from '@tanstack/react-table'
import { PlusIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/button'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { DateRangeFilter, type DateRangeValue } from '@/shared/ui/data-table/DateRangeFilter'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { SearchInput } from '@/shared/ui/data-table/SearchInput'
import {
  buildSupplierMaterialColumns,
  toTransactionRange,
  useSupplierMaterials,
  type SupplierMaterial,
} from '@/entities/supplier'
import { AttachSupplierMaterialDialog } from '@/features/supplier-material-attach'
import { DetachSupplierMaterialDialog } from '@/features/supplier-material-detach'
import { toMaterialSearchQuery } from '../model/search-query'

type Props = {
  supplier: { slug: string; code: string }
  /** Có gắn/gỡ vật tư không. `false` → không nút Gắn, không cột thao tác. */
  canManage: boolean
  /** Có ô tìm (mã / tên) + khoảng ngày tạo vật tư không — backend `supplierMaterialFilters`. */
  canFilter: boolean
}

/**
 * Tab "Vật tư" của trang chi tiết nhà cung cấp: `GET /suppliers/{slug}/materials` + gắn/gỡ.
 *
 * Bộ lọc giữ ở state của tab, KHÔNG lên URL: tab Giao dịch đã dùng `page` / `startDate` / `endDate` trên cùng URL.
 */
export function SupplierMaterials({ supplier, canManage, canFilter }: Props) {
  const { t } = useTranslation(['suppliers', 'common'])
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [search, setSearch] = useState('')
  const [range, setRange] = useState<DateRangeValue>({})
  const [attaching, setAttaching] = useState(false)
  const [detaching, setDetaching] = useState<SupplierMaterial | null>(null)

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

  const columns: ColumnDef<SupplierMaterial>[] = buildSupplierMaterialColumns(t)
  if (canManage) {
    columns.push({
      id: 'actions',
      header: t('suppliers:actions'),
      meta: { compactHeader: true },
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('suppliers:detachAria', { code: row.original.code })}
          onClick={() => setDetaching(row.original)}
        >
          {t('suppliers:detach')}
        </Button>
      ),
    })
  }

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
                }}
              />
            )
          }
          activeFilterCount={hasRange ? 1 : 0}
          onClearFilters={() => {
            setRange({})
            setPage(1)
          }}
          actions={
            canManage && (
              <Button onClick={() => setAttaching(true)}>
                <PlusIcon aria-hidden />
                {/* Mobile: chỉ còn dấu ＋; tên nút vẫn đọc được. */}
                <span className="max-md:sr-only">{t('suppliers:attachMaterial')}</span>
              </Button>
            )
          }
        />
      )}
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
          onPageChange: setPage,
          onSizeChange: setSize,
          isFetching: isPlaceholderData,
        }}
      />
      {canManage && (
        <>
          <AttachSupplierMaterialDialog
            supplier={attaching ? supplier : null}
            onOpenChange={(open) => !open && setAttaching(false)}
          />
          <DetachSupplierMaterialDialog
            supplier={supplier}
            material={detaching}
            onOpenChange={(open) => !open && setDetaching(null)}
          />
        </>
      )}
    </section>
  )
}

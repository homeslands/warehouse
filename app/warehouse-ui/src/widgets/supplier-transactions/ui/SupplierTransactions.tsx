import { PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useClampPage, useListParams } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { DataTable } from '@/shared/ui/data-table/DataTable'
import { DateRangeFilter } from '@/shared/ui/data-table/DateRangeFilter'
import { ListToolbar } from '@/shared/ui/data-table/ListToolbar'
import { SelectFilter } from '@/shared/ui/data-table/SelectFilter'
import {
  SUPPLIER_TRANSACTION_TYPES,
  buildSupplierTransactionColumns,
  toTransactionRange,
  useAllSupplierMaterials,
  useSupplierTransactions,
} from '@/entities/supplier'
import { SupplierTransactionFormSheet } from '@/features/supplier-transaction-form'

// Dùng chung URL với `?tab=` của trang: `useListParams` chỉ đọc/ghi khoá của schema này.
const FILTERS = z.object({
  type: z.enum(['PURCHASE', 'RETURN', 'PAYMENT']).optional(),
  materialSlug: z.string().optional(),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
})

type Props = {
  supplier: { slug: string; code: string }
  /** Có ghi giao dịch không. `false` → không nút Ghi giao dịch. */
  canRecord: boolean
  /** Có xem được vật tư không (`MATERIAL_READ`). `false` → không gọi API vật tư, ẩn bộ lọc Vật tư. */
  canViewMaterials: boolean
  /** Sheet ghi giao dịch báo chưa có vật tư → trang chuyển sang tab Vật tư. */
  onGoToMaterials: () => void
}

/** Tab "Giao dịch" của trang chi tiết nhà cung cấp: lịch sử, bộ lọc theo URL và nút ghi giao dịch. */
export function SupplierTransactions({
  supplier,
  canRecord,
  canViewMaterials,
  onGoToMaterials,
}: Props) {
  const { t } = useTranslation(['suppliers', 'common'])
  const { page, size, filters, setPage, setSize, setFilters } = useListParams(FILTERS)
  const [recording, setRecording] = useState(false)

  const materialsQuery = useAllSupplierMaterials(supplier.slug, { enabled: canViewMaterials })
  const { data, isPending, error, isPlaceholderData } = useSupplierTransactions(supplier.slug, {
    page,
    size,
    ...(filters.type && { type: filters.type }),
    ...(filters.materialSlug && { materialSlug: filters.materialSlug }),
    ...toTransactionRange(filters.startDate, filters.endDate),
  })
  useClampPage(isPlaceholderData ? undefined : data?.totalPages, page, setPage)

  const activeFilterCount = [
    filters.type,
    filters.materialSlug,
    filters.startDate || filters.endDate,
  ].filter(Boolean).length

  const columns = useMemo(() => buildSupplierTransactionColumns(t), [t])

  return (
    <section className="space-y-3">
      <ListToolbar
        onClearFilters={() =>
          setFilters({
            type: undefined,
            materialSlug: undefined,
            startDate: undefined,
            endDate: undefined,
          })
        }
        activeFilterCount={activeFilterCount}
        filters={
          <>
            <SelectFilter
              label={t('suppliers:filterType')}
              value={filters.type ?? ''}
              onChange={(value) =>
                setFilters({ type: value === '' ? undefined : (value as typeof filters.type) })
              }
              options={[
                { value: '', label: t('suppliers:typeAll') },
                ...SUPPLIER_TRANSACTION_TYPES.map((type) => ({
                  value: type,
                  label: t(`suppliers:type.${type}`),
                })),
              ]}
            />
            {canViewMaterials && (
              <SelectFilter
                label={t('suppliers:filterMaterial')}
                value={filters.materialSlug ?? ''}
                onChange={(value) => setFilters({ materialSlug: value === '' ? undefined : value })}
                options={[
                  { value: '', label: t('suppliers:materialAll') },
                  ...(materialsQuery.data?.items ?? []).map((m) => ({
                    value: m.slug,
                    label: `${m.code} · ${m.name}`,
                  })),
                ]}
              />
            )}
            <DateRangeFilter
              label={t('suppliers:filterTime')}
              value={{ from: filters.startDate, to: filters.endDate }}
              onChange={({ from, to }) => setFilters({ startDate: from, endDate: to })}
            />
          </>
        }
        actions={
          canRecord && (
            <Button onClick={() => setRecording(true)}>
              <PlusIcon aria-hidden />
              <span className="max-md:sr-only">{t('suppliers:recordTransaction')}</span>
            </Button>
          )
        }
      />
      <p className="text-muted-foreground text-sm">{t('suppliers:transactionsImmutable')}</p>
      <DataTable
        columns={columns}
        data={data?.items}
        isLoading={isPending}
        error={error}
        // Đang lọc mà rỗng → "Không có kết quả.", không nói "chưa có giao dịch". (Mặc định của
        // DataTable là `common:empty` "Chưa có dữ liệu." nên phải truyền `common:noResults` tường minh.)
        emptyText={activeFilterCount > 0 ? t('common:noResults') : t('suppliers:noTransactions')}
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
      {canRecord && (
        <SupplierTransactionFormSheet
          open={recording}
          onOpenChange={setRecording}
          supplier={supplier}
          canViewMaterials={canViewMaterials}
          onGoToMaterials={onGoToMaterials}
        />
      )}
    </section>
  )
}

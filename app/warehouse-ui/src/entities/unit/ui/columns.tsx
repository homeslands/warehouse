import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { formatDateTime, formatNumber } from '@/shared/lib/format'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import type { Unit } from '../model/types'

/** Cột danh sách đơn vị. Cột thao tác do tầng page thêm. */
export function buildUnitColumns(t: TFunction<readonly ['units', 'common']>): ColumnDef<Unit>[] {
  return [
    // Khung hẹp ẩn cột Mã (mã dài 32 ký tự sẽ chiếm hết bảng) → mã thành dòng phụ dưới tên.
    { accessorKey: 'code', header: t('units:columnCode'), meta: { hideBelow: '@sm' } },
    {
      accessorKey: 'name',
      header: t('units:columnName'),
      cell: ({ row }) => (
        <>
          <span className="block max-w-44 min-w-32 font-medium break-words whitespace-normal @sm:max-w-64">
            {row.original.name}
          </span>
          <span className="text-muted-foreground block max-w-44 text-xs break-words whitespace-normal @sm:hidden">
            {row.original.code}
          </span>
        </>
      ),
    },
    {
      accessorKey: 'description',
      header: t('units:columnDescription'),
      meta: { hideBelow: '@2xl' },
      cell: ({ row }) =>
        row.original.description ? (
          // Tối đa 2 dòng để bảng còn lướt được; đủ nội dung ở `title` và trong form sửa.
          <span
            title={row.original.description}
            className="line-clamp-2 block max-w-80 min-w-40 break-words whitespace-normal"
          >
            {row.original.description}
          </span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      id: 'usage',
      header: t('units:columnUsage'),
      cell: ({ row }) => {
        const { asBaseUnit, asConversionUnit, total } = row.original.materialCount
        // Backend lưu đơn vị gốc như một dòng của bảng đơn vị quy đổi (migration 1783728000022) nên
        // `asConversionUnit` GỒM cả vật tư dùng nó làm gốc — trừ ra để có số chỉ làm đơn vị quy đổi.
        const breakdown = t('units:usageBreakdown', {
          base: formatNumber(asBaseUnit),
          conversion: formatNumber(Math.max(0, asConversionUnit - asBaseUnit)),
        })
        // Phần tách ở `title` (chuột) + `sr-only` (trình đọc màn hình) — mobile vẫn có tổng.
        return (
          <>
            <span title={breakdown}>{formatNumber(total)}</span>
            <span className="sr-only">({breakdown})</span>
          </>
        )
      },
    },
    {
      accessorKey: 'createdAt',
      header: t('units:columnCreatedAt'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}

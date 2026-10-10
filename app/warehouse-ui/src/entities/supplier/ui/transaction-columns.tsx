import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { formatCurrency, formatDateTime, formatQuantity } from '@/shared/lib/format'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import type { SupplierTransaction } from '../model/types'
import { TransactionTypeIndicator } from './TransactionTypeIndicator'

const NUMBER_CELL = 'block text-right tabular-nums'

/** Cột sổ giao dịch. Dòng PAYMENT không có vật tư/số lượng/đơn giá → ô "Chưa có". */
export function buildSupplierTransactionColumns(
  t: TFunction<readonly ['suppliers', 'common']>,
): ColumnDef<SupplierTransaction>[] {
  return [
    {
      accessorKey: 'transactionDate',
      header: t('suppliers:columnTransactionDate'),
      cell: ({ row }) => formatDateTime(row.original.transactionDate),
    },
    {
      accessorKey: 'type',
      header: t('suppliers:columnType'),
      cell: ({ row }) => <TransactionTypeIndicator type={row.original.type} />,
    },
    {
      id: 'material',
      header: t('suppliers:columnMaterial'),
      cell: ({ row }) => {
        const { materialCode, materialName } = row.original
        if (!materialCode && !materialName) return <EmptyValue />
        return (
          <span className="block max-w-64 min-w-40 whitespace-normal">
            {[materialCode, materialName].filter(Boolean).join(' · ')}
          </span>
        )
      },
    },
    {
      accessorKey: 'quantity',
      header: t('suppliers:columnQuantity'),
      cell: ({ row }) =>
        row.original.quantity == null ? (
          <EmptyValue />
        ) : (
          <span className={NUMBER_CELL}>{formatQuantity(row.original.quantity)}</span>
        ),
    },
    {
      accessorKey: 'unitPrice',
      header: t('suppliers:columnUnitPrice'),
      cell: ({ row }) =>
        row.original.unitPrice == null ? (
          <EmptyValue />
        ) : (
          <span className={NUMBER_CELL}>{formatCurrency(row.original.unitPrice)}</span>
        ),
    },
    {
      accessorKey: 'amount',
      header: t('suppliers:columnAmount'),
      cell: ({ row }) => (
        <span className={`${NUMBER_CELL} font-medium`}>{formatCurrency(row.original.amount)}</span>
      ),
    },
    {
      accessorKey: 'performedByName',
      header: t('suppliers:columnPerformedBy'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) =>
        row.original.performedByName ? (
          <span className="block max-w-40 truncate" title={row.original.performedByName}>
            {row.original.performedByName}
          </span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      accessorKey: 'note',
      header: t('suppliers:columnNote'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) =>
        row.original.note ? (
          <span className="block max-w-56 truncate" title={row.original.note}>
            {row.original.note}
          </span>
        ) : (
          <EmptyValue />
        ),
    },
  ]
}

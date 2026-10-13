import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import { formatCurrency, formatDate } from '@/shared/lib/format'
import { ImportFormStatusBadge } from './ImportFormStatusBadge'
import type { ImportForm } from '../model/types'

/** Đường dẫn trang chi tiết do tầng page cấp — entity không biết route của app. */
export type DetailLink<T> = (row: T) => { to: string; state?: unknown }

/** Cột danh sách phiếu nhập. Cột thao tác do tầng page thêm. */
export function buildImportFormColumns(
  t: TFunction<readonly ['importForms', 'common']>,
  options: { detailLink?: DetailLink<ImportForm> } = {},
): ColumnDef<ImportForm>[] {
  const { detailLink } = options
  return [
    {
      accessorKey: 'code',
      header: t('importForms:columnCode'),
      cell: ({ row }) => {
        const { code } = row.original
        const text = (
          <span className="block max-w-40 font-medium break-words whitespace-normal">{code}</span>
        )
        if (!detailLink) return text
        const { to, state } = detailLink(row.original)
        return (
          <Link
            to={to}
            state={state}
            className="block max-w-40 font-medium break-words whitespace-normal underline-offset-4 hover:underline"
          >
            {code}
          </Link>
        )
      },
    },
    {
      accessorKey: 'date',
      header: t('importForms:columnDate'),
      cell: ({ row }) => formatDate(row.original.date),
    },
    {
      accessorKey: 'invoiceCode',
      header: t('importForms:columnInvoice'),
      meta: { hideBelow: '@2xl' },
      cell: ({ row }) => (
        <span className="block max-w-40 break-words whitespace-normal">
          {row.original.invoiceCode}
        </span>
      ),
    },
    {
      accessorKey: 'requesterName',
      header: t('importForms:columnRequester'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) => (
        <span className="block max-w-48 truncate" title={row.original.requesterName}>
          {row.original.requesterName}
        </span>
      ),
    },
    {
      accessorKey: 'total',
      header: t('importForms:columnTotal'),
      cell: ({ row }) => <span className="tabular-nums">{formatCurrency(row.original.total)}</span>,
    },
    {
      accessorKey: 'status',
      header: t('importForms:columnStatus'),
      cell: ({ row }) => <ImportFormStatusBadge status={row.original.status} />,
    },
  ]
}

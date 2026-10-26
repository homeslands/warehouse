import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import { EMPTY_VALUE, formatCurrency, formatDate } from '@/shared/lib/format'
import { ExportFormStatusBadge } from './ExportFormStatusBadge'
import type { ExportForm } from '../model/types'

/** Đường dẫn trang chi tiết do tầng page cấp — entity không biết route của app. */
export type DetailLink<T> = (row: T) => { to: string; state?: unknown }

/** Cột danh sách phiếu xuất. Cột thao tác do tầng page thêm. */
export function buildExportFormColumns(
  t: TFunction<readonly ['exportForms', 'common']>,
  options: { detailLink?: DetailLink<ExportForm> } = {},
): ColumnDef<ExportForm>[] {
  const { detailLink } = options
  return [
    {
      accessorKey: 'code',
      header: t('exportForms:columnCode'),
      // BE chỉ sắp theo createdAt | code.
      meta: { sortField: 'code' },
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
      accessorKey: 'type',
      header: t('exportForms:columnType'),
      cell: ({ row }) => t(`exportForms:type.${row.original.type}`),
    },
    {
      accessorKey: 'receiver',
      header: t('exportForms:columnReceiver'),
      meta: { hideBelow: '@2xl' },
      cell: ({ row }) => (
        <span className="block max-w-48 truncate" title={row.original.receiver}>
          {row.original.receiver}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('exportForms:columnStatus'),
      cell: ({ row }) => <ExportFormStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'requesterName',
      header: t('exportForms:columnRequester'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) => (
        <span className="block max-w-48 truncate" title={row.original.requesterName}>
          {row.original.requesterName}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: t('exportForms:columnCreatedAt'),
      meta: { hideBelow: '@3xl' },
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      accessorKey: 'totalAmount',
      header: t('exportForms:columnTotal'),
      // Chỉ phiếu Bán mới có giá trị tiền có nghĩa; các lý do khác không hiện số.
      cell: ({ row }) =>
        row.original.type === 'SALE' ? (
          <span className="tabular-nums">
            {formatCurrency(row.original.totalAmount, { maximumFractionDigits: 2 })}
          </span>
        ) : (
          EMPTY_VALUE
        ),
    },
  ]
}

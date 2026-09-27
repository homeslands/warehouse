import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import { EMPTY_VALUE, formatDateTime } from '@/shared/lib/format'
import type { Store } from '../model/types'
import { StoreStatusBadge } from './StoreStatusBadge'

/** Đường dẫn trang chi tiết do tầng page cấp — entity không biết route của app. */
export type DetailLink<T> = (row: T) => { to: string; state?: unknown }

/** Cột "Kho liên kết" dùng `warehouseName` backend đã flatten sẵn — không phải gọi thêm API. */
export function buildStoreColumns(
  t: TFunction<readonly ['stores', 'common']>,
  options: { detailLink?: DetailLink<Store> } = {},
): ColumnDef<Store>[] {
  const { detailLink } = options
  return [
    { accessorKey: 'code', header: t('stores:columnCode'), meta: { sortField: 'code' } },
    {
      accessorKey: 'name',
      header: t('stores:columnName'),
      meta: { sortField: 'name' },
      cell: ({ row }) => {
        if (!detailLink) return row.original.name
        const { to, state } = detailLink(row.original)
        return (
          <Link to={to} state={state} className="font-medium underline-offset-4 hover:underline">
            {row.original.name}
          </Link>
        )
      },
    },
    {
      accessorKey: 'legalName',
      header: t('stores:columnLegalName'),
      meta: { sortField: 'legalName' },
    },
    { accessorKey: 'taxCode', header: t('stores:columnTaxCode'), meta: { sortField: 'taxCode' } },
    {
      id: 'warehouse',
      header: t('stores:columnWarehouse'),
      cell: ({ row }) => row.original.warehouseName || EMPTY_VALUE,
    },
    {
      id: 'status',
      header: t('stores:columnStatus'),
      cell: ({ row }) => <StoreStatusBadge isActive={row.original.isActive} />,
    },
    {
      accessorKey: 'createdAt',
      meta: { sortField: 'createdAt' },
      header: t('stores:columnCreatedAt'),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}

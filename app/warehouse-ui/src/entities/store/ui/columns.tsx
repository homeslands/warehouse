import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import { EMPTY_VALUE, formatDateTime } from '@/shared/lib/format'
import type { Store } from '../model/types'
import { StoreStatusBadge } from './StoreStatusBadge'

/** Đường dẫn trang chi tiết do tầng page cấp — entity không biết route của app. */
export type DetailLink<T> = (row: T) => { to: string; state?: unknown }

/**
 * Cột "Kho liên kết" dùng `warehouseName` backend đã flatten sẵn — không phải gọi thêm API.
 * Khung bảng hẹp ẩn cột phụ (`meta.hideBelow`, theo container) — hẹp nhất còn Tên, Trạng thái, Thao tác;
 * đủ thông tin ở trang chi tiết. Tên được xuống dòng nhưng giữ tối thiểu 5rem.
 */
export function buildStoreColumns(
  t: TFunction<readonly ['stores', 'common']>,
  options: { detailLink?: DetailLink<Store> } = {},
): ColumnDef<Store>[] {
  const { detailLink } = options
  return [
    {
      accessorKey: 'code',
      header: t('stores:columnCode'),
      meta: { sortField: 'code', hideBelow: '@sm' },
    },
    {
      accessorKey: 'name',
      header: t('stores:columnName'),
      meta: { sortField: 'name' },
      cell: ({ row }) => {
        if (!detailLink) return row.original.name
        const { to, state } = detailLink(row.original)
        return (
          <Link
            to={to}
            state={state}
            className="inline-block min-w-20 font-medium break-words whitespace-normal underline-offset-4 hover:underline"
          >
            {row.original.name}
          </Link>
        )
      },
    },
    {
      accessorKey: 'legalName',
      header: t('stores:columnLegalName'),
      meta: { sortField: 'legalName', hideBelow: '@4xl' },
    },
    {
      accessorKey: 'taxCode',
      header: t('stores:columnTaxCode'),
      meta: { sortField: 'taxCode', hideBelow: '@2xl' },
    },
    {
      id: 'warehouse',
      meta: { hideBelow: '@2xl' },
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
      meta: { sortField: 'createdAt', hideBelow: '@4xl' },
      header: t('stores:columnCreatedAt'),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}

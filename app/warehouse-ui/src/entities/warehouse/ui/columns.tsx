import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import { EMPTY_VALUE, formatDateTime } from '@/shared/lib/format'
import type { Warehouse } from '../model/types'
import { WarehouseStatusBadge } from './WarehouseStatusBadge'

/** Đường dẫn trang chi tiết do tầng page cấp — entity không biết route của app. */
export type DetailLink<T> = (row: T) => { to: string; state?: unknown }

/**
 * Không có cột sắp xếp: `BaseQueryDto` nhận `sort` nhưng chưa service nào xử lý (mọi danh sách
 * `createdAt DESC`). Cột Quản lý hiện `managerPhonenumber` — backend KHÔNG trả tên quản lý.
 * Ô ngày format lúc render: bảng render lại khi đổi ngôn ngữ vì trang gọi `useTranslation()`.
 */
export function buildWarehouseColumns(
  t: TFunction<readonly ['warehouses', 'common']>,
  options: { detailLink?: DetailLink<Warehouse> } = {},
): ColumnDef<Warehouse>[] {
  const { detailLink } = options
  return [
    { accessorKey: 'code', header: t('warehouses:columnCode'), meta: { sortField: 'code' } },
    {
      accessorKey: 'name',
      header: t('warehouses:columnName'),
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
      accessorKey: 'address',
      header: t('warehouses:columnAddress'),
      meta: { sortField: 'address' },
    },
    {
      accessorKey: 'phonenumber',
      meta: { sortField: 'phonenumber' },
      header: t('warehouses:columnPhonenumber'),
      cell: ({ row }) => row.original.phonenumber || EMPTY_VALUE,
    },
    {
      id: 'manager',
      header: t('warehouses:columnManager'),
      cell: ({ row }) => row.original.managerPhonenumber || EMPTY_VALUE,
    },
    {
      id: 'status',
      header: t('warehouses:columnStatus'),
      cell: ({ row }) => <WarehouseStatusBadge isActive={row.original.isActive} />,
    },
    {
      accessorKey: 'createdAt',
      meta: { sortField: 'createdAt' },
      header: t('warehouses:columnCreatedAt'),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}

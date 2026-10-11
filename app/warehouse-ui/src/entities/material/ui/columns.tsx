import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import { formatDateTime, formatQuantity } from '@/shared/lib/format'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import type { Material } from '../model/types'

/** Đường dẫn trang chi tiết do tầng page cấp — entity không biết route của app. */
export type DetailLink<T> = (row: T) => { to: string; state?: unknown }

/** Cột danh sách vật tư. Cột thao tác do tầng page thêm. */
export function buildMaterialColumns(
  t: TFunction<readonly ['materials', 'common']>,
  options: { detailLink?: DetailLink<Material> } = {},
): ColumnDef<Material>[] {
  const { detailLink } = options
  return [
    {
      accessorKey: 'code',
      header: t('materials:columnCode'),
      meta: { hideBelow: '@sm' },
      // Mã tới 32 ký tự: xuống dòng tại dấu gạch thay vì bắt cả bảng cuộn ngang.
      cell: ({ row }) => (
        <span className="block max-w-40 break-words whitespace-normal">{row.original.code}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: t('materials:columnName'),
      cell: ({ row }) => {
        const { name, code } = row.original
        // Khung hẹp ẩn cột Mã → hiện mã ở dòng phụ dưới tên.
        const subCode = (
          <span className="text-muted-foreground block max-w-44 text-xs break-words whitespace-normal @sm:hidden">
            {code}
          </span>
        )
        if (!detailLink)
          return (
            <>
              <span className="block max-w-64 min-w-40 font-medium break-words whitespace-normal">
                {name}
              </span>
              {subCode}
            </>
          )
        const { to, state } = detailLink(row.original)
        return (
          <>
            <Link
              to={to}
              state={state}
              className="block max-w-64 min-w-40 font-medium break-words whitespace-normal underline-offset-4 hover:underline"
            >
              {name}
            </Link>
            {subCode}
          </>
        )
      },
    },
    {
      accessorKey: 'typeName',
      header: t('materials:columnType'),
      meta: { hideBelow: '@2xl' },
      cell: ({ row }) => (
        <span className="block max-w-48 min-w-28 break-words whitespace-normal">
          {row.original.typeName}
        </span>
      ),
    },
    {
      accessorKey: 'baseUnitCode',
      header: t('materials:columnBaseUnit'),
      meta: { hideBelow: '@sm' },
      cell: ({ row }) =>
        row.original.baseUnitCode ? (
          <span className="block max-w-40 break-words whitespace-normal">
            {row.original.baseUnitCode}
          </span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      accessorKey: 'minimumInventory',
      header: t('materials:columnMinimum'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) => formatQuantity(row.original.minimumInventory),
    },
    {
      accessorKey: 'maximumInventory',
      header: t('materials:columnMaximum'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) => formatQuantity(row.original.maximumInventory),
    },
    {
      accessorKey: 'createdAt',
      header: t('materials:columnCreatedAt'),
      meta: { hideBelow: '@6xl' },
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}

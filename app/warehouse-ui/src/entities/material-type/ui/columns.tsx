import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { formatDateTime } from '@/shared/lib/format'
import { EmptyValue } from '@/shared/ui/EmptyValue'
import type { MaterialType } from '../model/types'

/** Cột danh sách loại vật tư. Cột thao tác do tầng page thêm. */
export function buildMaterialTypeColumns(
  t: TFunction<readonly ['materialTypes', 'common']>,
): ColumnDef<MaterialType>[] {
  return [
    // Khung hẹp ẩn cột Mã (mã dài 32 ký tự sẽ chiếm hết bảng) → mã thành dòng phụ dưới tên.
    { accessorKey: 'code', header: t('materialTypes:columnCode'), meta: { hideBelow: '@sm' } },
    {
      accessorKey: 'name',
      header: t('materialTypes:columnName'),
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
      header: t('materialTypes:columnDescription'),
      meta: { hideBelow: '@2xl' },
      cell: ({ row }) =>
        row.original.description ? (
          // Tối đa 2 dòng để bảng còn lướt được; đủ nội dung ở `title` và trong form sửa.
          <span
            title={row.original.description}
            className="line-clamp-2 max-w-80 min-w-40 break-words whitespace-normal"
          >
            {row.original.description}
          </span>
        ) : (
          <EmptyValue />
        ),
    },
    {
      accessorKey: 'createdAt',
      header: t('materialTypes:columnCreatedAt'),
      meta: { hideBelow: '@4xl' },
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}

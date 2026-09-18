import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { EMPTY_VALUE, formatDateTime } from '@/shared/lib/format'
import type { Example } from '../model/types'

// Không có cột sắp xếp: backend bỏ qua tham số `sort`. Xem spec, mục "Cố tình KHÔNG có".
// Ô ngày format lúc render: bảng render lại khi đổi ngôn ngữ vì trang gọi useTranslation().
export function buildExampleColumns(
  t: TFunction<readonly ['examples', 'common']>,
): ColumnDef<Example>[] {
  return [
    { accessorKey: 'name', header: t('examples:columnName') },
    {
      accessorKey: 'description',
      header: t('examples:columnDescription'),
      cell: ({ row }) => row.original.description || EMPTY_VALUE,
    },
    { accessorKey: 'slug', header: t('examples:columnSlug') },
    {
      accessorKey: 'createdAt',
      header: t('examples:columnCreatedAt'),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ]
}

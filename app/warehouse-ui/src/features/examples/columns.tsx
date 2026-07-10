import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import type { Example } from './api'

// Không có cột sắp xếp: backend bỏ qua tham số `sort`. Xem spec, mục "Cố tình KHÔNG có".
export function buildExampleColumns(
  t: TFunction<readonly ['examples', 'common']>,
): ColumnDef<Example>[] {
  return [
    { accessorKey: 'name', header: t('examples:columnName') },
    {
      accessorKey: 'description',
      header: t('examples:columnDescription'),
      cell: ({ row }) => row.original.description ?? '—',
    },
    { accessorKey: 'slug', header: t('examples:columnSlug') },
    {
      accessorKey: 'createdAt',
      header: t('examples:columnCreatedAt'),
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
    },
  ]
}

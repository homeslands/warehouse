import type { ColumnDef } from '@tanstack/react-table'
import type { Example } from './api'

// Không có cột sắp xếp: backend bỏ qua tham số `sort`. Xem spec, mục "Cố tình KHÔNG có".
export const exampleColumns: ColumnDef<Example>[] = [
  { accessorKey: 'name', header: 'Tên' },
  {
    accessorKey: 'description',
    header: 'Mô tả',
    cell: ({ row }) => row.original.description ?? '—',
  },
  { accessorKey: 'slug', header: 'Slug' },
  {
    accessorKey: 'createdAt',
    header: 'Ngày tạo',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleString('vi-VN'),
  },
]

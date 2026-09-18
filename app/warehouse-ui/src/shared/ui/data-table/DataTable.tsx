import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { PAGE_SIZE_OPTIONS } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { Skeleton } from '@/shared/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'

export type DataTablePagination = {
  page: number
  size: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onSizeChange: (size: number) => void
  /** Đang tải trang khác trong khi bảng hiện dữ liệu giữ chỗ → khoá nút trước/sau. */
  isFetching: boolean
}

type DataTableProps<TData> = {
  columns: ColumnDef<TData>[]
  /** `undefined` = chưa có dữ liệu lần nào (đang tải lần đầu hoặc lần đầu lỗi). */
  data: TData[] | undefined
  isLoading: boolean
  /** Chỉ hiện khi chưa có dữ liệu. Đã có dữ liệu thì giữ dữ liệu — handler global đã toast. */
  error?: unknown
  emptyText?: string
  pagination?: DataTablePagination
}

const SKELETON_ROWS = 5

export function DataTable<TData>({
  columns,
  data,
  isLoading,
  error,
  emptyText,
  pagination,
}: DataTableProps<TData>) {
  const { t } = useTranslation(['common'])
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  const rows = table.getRowModel().rows
  const colSpan = Math.max(columns.length, 1)

  const body = (() => {
    if (data === undefined && error != null) {
      return (
        <TableRow>
          <TableCell colSpan={colSpan}>
            <p role="alert" className="text-destructive text-sm">
              {resolveApiErrorMessage(error)}
            </p>
          </TableCell>
        </TableRow>
      )
    }
    if (data === undefined && isLoading) {
      return Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <TableRow key={`skeleton-${i}`} data-testid="skeleton-row">
          {Array.from({ length: colSpan }, (_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))
    }
    if (rows.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={colSpan} className="text-muted-foreground">
            {emptyText ?? t('common:empty')}
          </TableCell>
        </TableRow>
      )
    }
    return rows.map((row) => (
      <TableRow key={row.id}>
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    ))
  })()

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
      </div>

      {pagination && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            {t('common:pageSize')}
            <select
              className="border-input bg-background text-foreground dark:bg-input/30 h-8 rounded-lg border px-2 text-sm"
              value={pagination.size}
              onChange={(event) => pagination.onSizeChange(Number(event.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <span className="text-muted-foreground text-sm">
            {t('common:pageInfo', {
              page: pagination.page,
              totalPages: Math.max(pagination.totalPages, 1),
              total: pagination.total,
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.isFetching || pagination.page <= 1}
            onClick={() => pagination.onPageChange(pagination.page - 1)}
          >
            {t('common:prevPage')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.isFetching || pagination.page >= pagination.totalPages}
            onClick={() => pagination.onPageChange(pagination.page + 1)}
          >
            {t('common:nextPage')}
          </Button>
        </div>
      )}
    </div>
  )
}

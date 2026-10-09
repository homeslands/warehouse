import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react'
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveApiErrorMessage } from '@/shared/lib/api-error-message'
import { cn } from '@/shared/lib/cn'
import { formatNumber } from '@/shared/lib/format'
import { PAGE_SIZE_OPTIONS, type SortState } from '@/shared/lib/list-params'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
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
  /** Dòng báo trống — được phép kèm nút/link (vd "tìm theo trường khác"). */
  emptyText?: ReactNode
  pagination?: DataTablePagination
  /**
   * Bật sắp xếp theo cột. Cột nào sắp xếp được thì khai `meta: { sortField: '<tên trường backend>' }`
   * trong `ColumnDef` — cột không khai thì header vẫn là chữ thường, không bấm được.
   *
   * Sắp xếp chạy Ở SERVER: `onChange` chỉ đổi tham số rồi để danh sách tải lại. **Không** dùng
   * `getSortedRowModel` của TanStack — nó chỉ sắp trong trang hiện tại (10–50 dòng), người dùng sẽ
   * tưởng cả danh sách đã được sắp.
   */
  sorting?: DataTableSorting
  /**
   * Bấm vào hàng (vd mở trang chi tiết). Bỏ qua cú bấm vào phần tử tương tác trong hàng (link, nút,
   * menu `⋯`, ô chọn) và cú bấm khi đang bôi đen chữ. Ô chính của hàng vẫn nên là `<Link>` để bàn
   * phím và Ctrl/⌘+bấm (mở tab mới) dùng được — hàng `<tr>` không nhận focus.
   */
  onRowClick?: (row: TData) => void
}

export type DataTableSorting = {
  value: SortState | undefined
  onChange: (next: SortState | undefined) => void
}

/** Bấm lần lượt: chưa sắp → tăng → giảm → thôi sắp. */
function nextSort(current: SortState | undefined, field: string): SortState | undefined {
  if (current?.field !== field) return { field, dir: 'ASC' }
  if (current.dir === 'ASC') return { field, dir: 'DESC' }
  return undefined
}

/**
 * `meta` của ColumnDef là `unknown` với TanStack — khai kiểu ở đây để đọc có kiểm.
 * `hideBelow`: ẩn cột phụ khi **khung bảng** hẹp hơn mốc (container query — tính theo chỗ thật còn
 * lại, kể cả khi sidebar đang mở; breakpoint theo cửa sổ thì sai ở tablet/laptop có sidebar).
 * Mốc: `@sm` 24rem · `@2xl` 42rem · `@4xl` 56rem · `@5xl` 64rem · `@6xl` 72rem. Cột tên, trạng thái, thao tác
 * đừng khai.
 */
export type DataTableColumnMeta = {
  sortField?: string
  hideBelow?: '@sm' | '@2xl' | '@4xl' | '@5xl' | '@6xl'
  /**
   * Cột chỉ có icon (vd menu `⋯`): khung < `@sm` thì chữ tiêu đề chỉ còn cho trình đọc màn hình — chữ
   * "Thao tác" rộng gấp đôi cái nút, đủ đẩy cả cột ra khỏi khung trên điện thoại.
   */
  compactHeader?: boolean
}

// Chuỗi class viết đủ để Tailwind quét được — không ghép động.
const HIDE_BELOW = {
  '@sm': 'hidden @sm:table-cell',
  '@2xl': 'hidden @2xl:table-cell',
  '@4xl': 'hidden @4xl:table-cell',
  '@5xl': 'hidden @5xl:table-cell',
  '@6xl': 'hidden @6xl:table-cell',
} as const

function hiddenClass(meta: unknown): string | undefined {
  const hideBelow = (meta as DataTableColumnMeta | undefined)?.hideBelow
  return hideBelow && HIDE_BELOW[hideBelow]
}

/**
 * Cột `id: 'actions'` (menu `⋯`) luôn ghim mép phải: một ô quá rộng (email dài, nhiều kho, vai trò tự tạo
 * tên dài) làm bảng cuộn ngang thì nút thao tác vẫn thấy và bấm được, không bị đẩy ra ngoài khung. Nền đục
 * để chữ cuộn bên dưới không lộ qua; khi bảng thực sự cuộn ngang thì thêm bóng mép trái để báo còn nội dung
 * phía dưới. Màu nền khi hover/mở menu pha sẵn cho khớp `hover:bg-muted/50` của hàng.
 */
const PINNED_RIGHT =
  'sticky right-0 z-[1] bg-background [tr:hover>&]:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] [tr:has([aria-expanded=true])>&]:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] group-data-[overflowing=true]/table:shadow-[-6px_0_6px_-6px_rgb(0_0_0/0.2)]'

function pinnedProps(columnId: string) {
  return columnId === 'actions'
    ? ({ 'data-pinned': 'right', className: PINNED_RIGHT } as const)
    : undefined
}

/** Bảng có đang tràn ngang không — chỉ để bật bóng mép của cột ghim. */
function useOverflowing() {
  const ref = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    const scroller = ref.current?.querySelector<HTMLElement>('[data-slot="table-container"]')
    if (!scroller || typeof ResizeObserver === 'undefined') return
    const update = () => setOverflowing(scroller.scrollWidth > scroller.clientWidth + 1)
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    const table = scroller.querySelector('table')
    if (table) observer.observe(table)
    update()
    return () => observer.disconnect()
  }, [])
  return { ref, overflowing }
}

const SKELETON_ROWS = 5

const INTERACTIVE =
  'a, button, input, select, textarea, label, [role="menuitem"], [role="checkbox"]'

/**
 * Cú bấm có thuộc về chính hàng không. Menu `⋯` render qua portal: DOM nằm ngoài `<tr>` nhưng sự
 * kiện React vẫn nổi lên hàng — `contains` loại được trường hợp đó.
 */
function isRowClick(event: MouseEvent<HTMLTableRowElement>): boolean {
  const target = event.target as Element
  if (!event.currentTarget.contains(target)) return false
  if (target.closest(INTERACTIVE)) return false
  return !window.getSelection()?.toString()
}

export function DataTable<TData>({
  columns,
  data,
  isLoading,
  error,
  emptyText,
  pagination,
  sorting,
  onRowClick,
}: DataTableProps<TData>) {
  const { t } = useTranslation(['common'])
  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })
  const rows = table.getRowModel().rows
  const colSpan = Math.max(columns.length, 1)
  const { ref: frameRef, overflowing } = useOverflowing()

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
          {/* Câu báo trống có thể dài (kèm từ khoá tìm) — cho xuống hàng, đừng kéo bảng tràn ngang. */}
          <TableCell colSpan={colSpan} className="text-muted-foreground whitespace-normal">
            {emptyText ?? t('common:empty')}
          </TableCell>
        </TableRow>
      )
    }
    return rows.map((row) => (
      <TableRow
        key={row.id}
        className={cn(onRowClick && 'cursor-pointer')}
        onClick={
          onRowClick &&
          ((event) => {
            if (isRowClick(event)) onRowClick(row.original)
          })
        }
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell
            key={cell.id}
            {...pinnedProps(cell.column.id)}
            className={cn(
              hiddenClass(cell.column.columnDef.meta),
              pinnedProps(cell.column.id)?.className,
            )}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    ))
  })()

  return (
    <div className="space-y-4">
      <div
        ref={frameRef}
        data-overflowing={overflowing}
        // overflow-hidden: cắt nội dung theo góc bo — không thì ô cột ghim (nền đặc, góc vuông) đè lên góc
        // bo của viền. An toàn vì bảng không có gì sticky-top theo trang; menu/popover đều qua portal.
        className="group/table @container overflow-hidden rounded-md border"
      >
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const field = (header.column.columnDef.meta as DataTableColumnMeta | undefined)
                    ?.sortField
                  const rendered = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())
                  const label = (header.column.columnDef.meta as DataTableColumnMeta | undefined)
                    ?.compactHeader ? (
                    // `not-sr-only` đặt lại `white-space: normal` → giữ một dòng như mọi tiêu đề khác.
                    <span className="sr-only @sm:not-sr-only @sm:whitespace-nowrap">
                      {rendered}
                    </span>
                  ) : (
                    rendered
                  )
                  const active =
                    field !== undefined && sorting?.value?.field === field
                      ? sorting.value.dir
                      : undefined

                  const pinned = pinnedProps(header.column.id)
                  const hidden = cn(hiddenClass(header.column.columnDef.meta), pinned?.className)

                  if (sorting === undefined || field === undefined) {
                    return (
                      <TableHead key={header.id} {...pinned} className={hidden}>
                        {label}
                      </TableHead>
                    )
                  }
                  return (
                    <TableHead
                      key={header.id}
                      {...pinned}
                      className={hidden}
                      aria-sort={
                        active === 'ASC' ? 'ascending' : active === 'DESC' ? 'descending' : 'none'
                      }
                    >
                      <button
                        type="button"
                        className="-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 hover:text-foreground"
                        onClick={() => sorting.onChange(nextSort(sorting.value, field))}
                      >
                        {label}
                        {active === 'ASC' ? (
                          <ArrowUpIcon className="size-3.5" aria-hidden />
                        ) : active === 'DESC' ? (
                          <ArrowDownIcon className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpDownIcon className="size-3.5 opacity-40" aria-hidden />
                        )}
                      </button>
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>{body}</TableBody>
        </Table>
      </div>

      {pagination && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <span aria-hidden>{t('common:pageSize')}</span>
            {/* Nhãn nhìn thấy được nằm ngoài nút mở (Radix Select là <button>, không nối được
                bằng <label> bọc ngoài) nên tên khả truy cập đặt thẳng bằng aria-label. */}
            <Select
              value={String(pagination.size)}
              onValueChange={(next) => pagination.onSizeChange(Number(next))}
            >
              <SelectTrigger aria-label={t('common:pageSize')} size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-muted-foreground text-sm">
            {t('common:pageInfo', {
              page: pagination.page,
              totalPages: Math.max(pagination.totalPages, 1),
              total: formatNumber(pagination.total),
            })}
          </span>
          {/* Hai nút đi cùng nhau: màn hẹp xuống dòng cả cặp, không tách "Trang sau" ra dòng riêng. */}
          <div className="flex gap-2">
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
        </div>
      )}
    </div>
  )
}

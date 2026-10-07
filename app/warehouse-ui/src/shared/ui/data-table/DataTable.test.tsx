import type { ColumnDef } from '@tanstack/react-table'
import { cleanup, render, screen } from '@testing-library/react'
import { createPortal } from 'react-dom'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SortState } from '@/shared/lib/list-params'
import { DataTable, type DataTablePagination } from './DataTable'

type Row = { id: string; name: string }

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'id', header: 'Mã' },
  { accessorKey: 'name', header: 'Tên' },
]

const rows: Row[] = [
  { id: '1', name: 'Ốc vít' },
  { id: '2', name: 'Bu lông' },
]

function pagination(over: Partial<DataTablePagination> = {}): DataTablePagination {
  return {
    page: 2,
    size: 10,
    total: 45,
    totalPages: 5,
    onPageChange: vi.fn(),
    onSizeChange: vi.fn(),
    isFetching: false,
    ...over,
  }
}

describe('DataTable — trạng thái', () => {
  it('tải lần đầu → 5 dòng skeleton, không có dòng dữ liệu', () => {
    render(<DataTable columns={columns} data={undefined} isLoading />)
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(5)
    expect(screen.queryByText('Chưa có dữ liệu.')).not.toBeInTheDocument()
  })

  it('hiện dữ liệu', () => {
    render(<DataTable columns={columns} data={rows} isLoading={false} />)
    expect(screen.getByRole('columnheader', { name: 'Tên' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Bu lông' })).toBeInTheDocument()
  })

  it('không có dòng → emptyText; mặc định lấy từ common', () => {
    const { rerender } = render(<DataTable columns={columns} data={[]} isLoading={false} />)
    expect(screen.getByText('Chưa có dữ liệu.')).toBeInTheDocument()

    rerender(
      <DataTable columns={columns} data={[]} isLoading={false} emptyText="Chưa có vật tư." />,
    )
    expect(screen.getByText('Chưa có vật tư.')).toBeInTheDocument()
  })

  it('lỗi khi chưa có dữ liệu → thông báo lỗi trong bảng (role=alert), không kèm "rỗng"', () => {
    const error = { statusCode: 500, timestamp: '', path: '', method: 'GET', message: 'boom' }
    render(<DataTable columns={columns} data={undefined} isLoading={false} error={error} />)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    expect(screen.queryByText('Chưa có dữ liệu.')).not.toBeInTheDocument()
  })

  it('lỗi khi đã có dữ liệu → giữ dữ liệu, không hiện lỗi tại chỗ', () => {
    const error = { statusCode: 500, timestamp: '', path: '', method: 'GET', message: 'boom' }
    render(<DataTable columns={columns} data={rows} isLoading={false} error={error} />)
    expect(screen.getByText('Ốc vít')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('DataTable — phân trang', () => {
  it('chân bảng "Trang x / y — n bản ghi"; y tối thiểu 1', () => {
    const { rerender } = render(
      <DataTable columns={columns} data={rows} isLoading={false} pagination={pagination()} />,
    )
    expect(screen.getByText('Trang 2 / 5 — 45 bản ghi')).toBeInTheDocument()

    rerender(
      <DataTable
        columns={columns}
        data={[]}
        isLoading={false}
        pagination={pagination({ page: 1, total: 0, totalPages: 0 })}
      />,
    )
    expect(screen.getByText('Trang 1 / 1 — 0 bản ghi')).toBeInTheDocument()
  })

  it('nút trước/sau gọi onPageChange với trang kề', async () => {
    const p = pagination()
    render(<DataTable columns={columns} data={rows} isLoading={false} pagination={p} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Trang sau' }))
    expect(p.onPageChange).toHaveBeenLastCalledWith(3)
    await user.click(screen.getByRole('button', { name: 'Trang trước' }))
    expect(p.onPageChange).toHaveBeenLastCalledWith(1)
  })

  it('trang đầu khoá "Trang trước", trang cuối khoá "Trang sau"', () => {
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={rows}
        isLoading={false}
        pagination={pagination({ page: 1 })}
      />,
    )
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeEnabled()

    rerender(
      <DataTable
        columns={columns}
        data={rows}
        isLoading={false}
        pagination={pagination({ page: 5 })}
      />,
    )
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
  })

  it('đang tải trang khác (isFetching) → khoá cả hai nút', () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        isLoading={false}
        pagination={pagination({ isFetching: true })}
      />,
    )
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled()
  })

  it('chọn số dòng 10/20/50 → onSizeChange(number)', async () => {
    const p = pagination()
    render(<DataTable columns={columns} data={rows} isLoading={false} pagination={p} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'Số dòng mỗi trang' }))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      '10',
      '20',
      '50',
    ])

    await user.click(screen.getByRole('option', { name: '20' }))
    expect(p.onSizeChange).toHaveBeenLastCalledWith(20)
  })

  it('không truyền pagination → không có chân bảng', () => {
    render(<DataTable columns={columns} data={rows} isLoading={false} />)
    expect(screen.queryByRole('button', { name: 'Trang sau' })).not.toBeInTheDocument()
  })
})

describe('DataTable — sắp xếp theo cột', () => {
  const sortableColumns = [
    { accessorKey: 'name', header: 'Tên', meta: { sortField: 'name' } },
    { accessorKey: 'note', header: 'Ghi chú' },
  ] as ColumnDef<{ name: string; note: string }>[]

  function renderSortable(value: SortState | undefined) {
    const onChange = vi.fn()
    render(
      <DataTable
        columns={sortableColumns}
        data={[{ name: 'A', note: 'x' }]}
        isLoading={false}
        sorting={{ value, onChange }}
      />,
    )
    return { onChange, user: userEvent.setup() }
  }

  it('không truyền `sorting` → header là chữ thường, không bấm được', () => {
    render(<DataTable columns={sortableColumns} data={[]} isLoading={false} />)

    expect(screen.queryByRole('button', { name: /Tên/ })).not.toBeInTheDocument()
  })

  it('chỉ cột khai meta.sortField mới bấm được', () => {
    renderSortable(undefined)

    expect(screen.getByRole('button', { name: /Tên/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ghi chú/ })).not.toBeInTheDocument()
  })

  it('bấm lần lượt: chưa sắp → tăng → giảm → thôi sắp', async () => {
    const first = renderSortable(undefined)
    await first.user.click(screen.getByRole('button', { name: /Tên/ }))
    expect(first.onChange).toHaveBeenCalledWith({ field: 'name', dir: 'ASC' })
    cleanup()

    const second = renderSortable({ field: 'name', dir: 'ASC' })
    await second.user.click(screen.getByRole('button', { name: /Tên/ }))
    expect(second.onChange).toHaveBeenCalledWith({ field: 'name', dir: 'DESC' })
    cleanup()

    const third = renderSortable({ field: 'name', dir: 'DESC' })
    await third.user.click(screen.getByRole('button', { name: /Tên/ }))
    expect(third.onChange).toHaveBeenCalledWith(undefined)
  })

  it('đang sắp cột khác → bấm cột này bắt đầu lại từ tăng', async () => {
    const { onChange, user } = renderSortable({ field: 'createdAt', dir: 'DESC' })

    await user.click(screen.getByRole('button', { name: /Tên/ }))

    expect(onChange).toHaveBeenCalledWith({ field: 'name', dir: 'ASC' })
  })

  it('trạng thái sắp xếp báo cho trình đọc màn hình qua aria-sort', () => {
    renderSortable({ field: 'name', dir: 'DESC' })

    expect(screen.getByRole('columnheader', { name: /Tên/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    expect(screen.getByRole('columnheader', { name: 'Ghi chú' })).not.toHaveAttribute('aria-sort')
  })
})

describe('DataTable — bấm vào hàng', () => {
  const withButton: ColumnDef<Row>[] = [
    ...columns,
    {
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => <button type="button">Menu {row.original.name}</button>,
    },
  ]

  it('bấm vào ô của hàng → gọi onRowClick với dữ liệu hàng đó; hàng có con trỏ bấm', async () => {
    const onRowClick = vi.fn()
    render(<DataTable columns={withButton} data={rows} isLoading={false} onRowClick={onRowClick} />)

    await userEvent.click(screen.getByText('Bu lông'))

    expect(onRowClick).toHaveBeenCalledExactlyOnceWith(rows[1])
    expect(screen.getByText('Bu lông').closest('tr')).toHaveClass('cursor-pointer')
  })

  it('bấm vào nút trong hàng → không gọi onRowClick', async () => {
    const onRowClick = vi.fn()
    render(<DataTable columns={withButton} data={rows} isLoading={false} onRowClick={onRowClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Menu Ốc vít' }))

    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('bấm vào nội dung portal của một ô (popover, menu) → không gọi onRowClick', async () => {
    // Portal nằm ngoài <tr> trong DOM nhưng sự kiện React vẫn nổi lên hàng.
    const withPortal: ColumnDef<Row>[] = [
      ...columns,
      { id: 'portal', header: '', cell: () => createPortal(<p>Nội dung nổi</p>, document.body) },
    ]
    const onRowClick = vi.fn()
    render(
      <DataTable
        columns={withPortal}
        data={rows.slice(0, 1)}
        isLoading={false}
        onRowClick={onRowClick}
      />,
    )

    await userEvent.click(screen.getByText('Nội dung nổi'))

    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('không truyền onRowClick → hàng không có con trỏ bấm', () => {
    render(<DataTable columns={columns} data={rows} isLoading={false} />)
    expect(screen.getByText('Ốc vít').closest('tr')).not.toHaveClass('cursor-pointer')
  })
})

describe('DataTable — ẩn cột phụ khi khung bảng hẹp (container query)', () => {
  it('meta.hideBelow → header và ô của cột đó mang class ẩn theo mốc container; cột khác giữ nguyên; khung bảng là @container', () => {
    const responsive: ColumnDef<Row>[] = [
      { accessorKey: 'id', header: 'Mã' },
      { accessorKey: 'name', header: 'Tên', meta: { hideBelow: '@2xl' } },
    ]
    render(<DataTable columns={responsive} data={rows.slice(0, 1)} isLoading={false} />)

    expect(screen.getByRole('columnheader', { name: 'Tên' })).toHaveClass(
      'hidden',
      '@2xl:table-cell',
    )
    expect(screen.getByRole('cell', { name: 'Ốc vít' })).toHaveClass('hidden', '@2xl:table-cell')
    expect(screen.getByRole('columnheader', { name: 'Mã' })).not.toHaveClass('hidden')
    expect(screen.getByRole('cell', { name: '1' })).not.toHaveClass('hidden')
    expect(screen.getByRole('table').closest('.\\@container')).not.toBeNull()
  })
})

describe('DataTable — tiêu đề gọn cho cột icon', () => {
  it('meta.compactHeader → chữ tiêu đề chỉ còn cho trình đọc màn hình khi khung < @sm', () => {
    const compact: ColumnDef<Row>[] = [
      { accessorKey: 'name', header: 'Tên' },
      { id: 'actions', header: 'Thao tác', meta: { compactHeader: true }, cell: () => '⋯' },
    ]
    render(<DataTable columns={compact} data={rows.slice(0, 1)} isLoading={false} />)

    expect(screen.getByText('Thao tác')).toHaveClass('sr-only', '@sm:not-sr-only')
    expect(screen.getByRole('columnheader', { name: 'Thao tác' })).toBeInTheDocument()
    expect(screen.getByText('Tên')).not.toHaveClass('sr-only')
  })
})

describe('DataTable — dữ liệu xấu (break-ui)', () => {
  it('cột id "actions" luôn ghim mép phải: header và ô mang data-pinned="right"', () => {
    const withActions: ColumnDef<Row>[] = [
      { accessorKey: 'name', header: 'Tên' },
      { id: 'actions', header: 'Thao tác', cell: () => <button type="button">⋯</button> },
    ]
    render(<DataTable columns={withActions} data={rows.slice(0, 1)} isLoading={false} />)

    expect(screen.getByRole('columnheader', { name: 'Thao tác' })).toHaveAttribute(
      'data-pinned',
      'right',
    )
    expect(screen.getByRole('button', { name: '⋯' }).closest('td')).toHaveAttribute(
      'data-pinned',
      'right',
    )
    expect(screen.getByRole('columnheader', { name: 'Tên' })).not.toHaveAttribute('data-pinned')
  })

  it('tổng số bản ghi có dấu phân cách hàng nghìn theo ngôn ngữ', () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        isLoading={false}
        pagination={pagination({ page: 1, total: 1284, totalPages: 129 })}
      />,
    )
    expect(screen.getByText('Trang 1 / 129 — 1.284 bản ghi')).toBeInTheDocument()
  })
})

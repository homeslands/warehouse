import type { ColumnDef } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
    const select = screen.getByLabelText('Số dòng mỗi trang')

    expect(Array.from(select.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      '10',
      '20',
      '50',
    ])
    await userEvent.setup().selectOptions(select, '20')
    expect(p.onSizeChange).toHaveBeenLastCalledWith(20)
  })

  it('không truyền pagination → không có chân bảng', () => {
    render(<DataTable columns={columns} data={rows} isLoading={false} />)
    expect(screen.queryByRole('button', { name: 'Trang sau' })).not.toBeInTheDocument()
  })
})

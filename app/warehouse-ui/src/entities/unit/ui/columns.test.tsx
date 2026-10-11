import { render, screen } from '@testing-library/react'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { buildUnitColumns } from './columns'
import type { Unit } from '../model/types'

const unit: Unit = {
  slug: 'u-bag',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  code: 'BAG',
  name: 'Bao 50kg',
  description: null,
  // Backend lưu đơn vị gốc như một dòng của bảng đơn vị quy đổi → `asConversionUnit` gồm cả 1 vật tư làm gốc.
  materialCount: { asBaseUnit: 1, asConversionUnit: 5, total: 5 },
}

function Table({ rows }: { rows: Unit[] }) {
  const { t } = useTranslation(['units', 'common'])
  const table = useReactTable({
    data: rows,
    columns: buildUnitColumns(t),
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

describe('buildUnitColumns', () => {
  it('cột Đang dùng hiện tổng, phần tách trừ số làm gốc khỏi số quy đổi, nằm ở title + sr-only; mô tả trống → "Chưa có"', () => {
    render(<Table rows={[unit]} />)

    const usage = screen.getByText('5')
    expect(usage).toHaveAttribute('title', '1 làm đơn vị gốc · 4 làm đơn vị quy đổi')
    expect(screen.getByText('(1 làm đơn vị gốc · 4 làm đơn vị quy đổi)')).toHaveClass('sr-only')
    expect(screen.getByText('Chưa có')).toBeInTheDocument()
  })

  it('dữ liệu xấu: cột Mã ẩn khi khung hẹp, mã thành dòng phụ dưới tên; tên không khoảng trắng được ngắt; mô tả tối đa 2 dòng', () => {
    const t = ((k: string) => k) as unknown as Parameters<typeof buildUnitColumns>[0]
    expect(buildUnitColumns(t)[0].meta).toMatchObject({ hideBelow: '@sm' })

    const long =
      'Đơn vị đóng gói dùng cho hàng xuất khẩu sang Nhật Bản và Hàn Quốc, quy cách 24 chai/thùng'
    render(
      <Table
        rows={[
          {
            ...unit,
            code: 'THUNG-24CHAI-500ML-PET-XK-202601',
            name: 'ỐngNhựaPVCBìnhMinhPhi114x4,9mmClass3TiêuChuẩnISO1452',
            description: long,
          },
        ]}
      />,
    )
    const name = screen.getByText('ỐngNhựaPVCBìnhMinhPhi114x4,9mmClass3TiêuChuẩnISO1452')
    expect(name).toHaveClass('break-words', 'max-w-44', '@sm:max-w-64')
    const sub = screen
      .getAllByText('THUNG-24CHAI-500ML-PET-XK-202601')
      .find((el) => el.className.includes('@sm:hidden'))
    expect(sub).toHaveClass('break-words', 'whitespace-normal')
    const desc = screen.getByText(long)
    expect(desc).toHaveClass('line-clamp-2')
    // `block` đè `display: -webkit-box` của line-clamp → mô tả hiện hết các dòng (break-ui 2026-10-11).
    expect(desc).not.toHaveClass('block')
    expect(desc).toHaveAttribute('title', long)
  })
})

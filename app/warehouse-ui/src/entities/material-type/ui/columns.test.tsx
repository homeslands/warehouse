import { render, screen } from '@testing-library/react'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { buildMaterialTypeColumns } from './columns'
import type { MaterialType } from '../model/types'

const long =
  'Vật liệu xây dựng, hoàn thiện nội thất và phụ kiện lắp đặt công trình dân dụng, công nghiệp'
const type: MaterialType = {
  slug: 'mt-1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  code: 'VLXD-HOAN-THIEN-NOI-THAT-2026-01',
  name: 'HoáChấtTẩyRửaCôngNghiệpNồngĐộCaoKhôngPhaLoãng',
  description: long,
}

function Table() {
  const { t } = useTranslation(['materialTypes', 'common'])
  const table = useReactTable({
    data: [type],
    columns: buildMaterialTypeColumns(t),
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

describe('buildMaterialTypeColumns', () => {
  it('dữ liệu xấu: cột Mã ẩn khi khung hẹp, mã thành dòng phụ; tên được ngắt; mô tả tối đa 2 dòng', () => {
    const t = ((k: string) => k) as unknown as Parameters<typeof buildMaterialTypeColumns>[0]
    expect(buildMaterialTypeColumns(t)[0].meta).toMatchObject({ hideBelow: '@sm' })

    render(<Table />)
    expect(screen.getByText(type.name)).toHaveClass('break-words', 'max-w-44', '@sm:max-w-64')
    // Dòng mã phụ (khung hẹp) phải ngắt được, nếu không nó giữ cột Tên rộng ra và đẩy cột khác ra ngoài.
    expect(
      screen.getAllByText(type.code).find((el) => el.className.includes('@sm:hidden')),
    ).toHaveClass('break-words', 'whitespace-normal')
    const desc = screen.getByText(long)
    expect(desc).toHaveClass('line-clamp-2')
    expect(desc).toHaveAttribute('title', long)
  })
})

import { render, screen } from '@testing-library/react'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { buildConversionUnitColumns } from './conversion-columns'
import type { MaterialConversionUnit } from '../model/types'

const rows: MaterialConversionUnit[] = [
  { unitSlug: 'u-kg', unitCode: 'KG', unitName: 'Kilogram', conversionRate: 1, isBaseUnit: true },
  { unitSlug: 'u-g', unitCode: 'G', unitName: 'Gram', conversionRate: 0.001, isBaseUnit: false },
]

function Table() {
  const { t } = useTranslation(['materials', 'common'])
  const table = useReactTable({
    data: rows,
    columns: buildConversionUnitColumns(t, 'KG'),
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

function LongTable() {
  const { t } = useTranslation(['materials', 'common'])
  const table = useReactTable({
    data: [
      {
        unitSlug: 'u-pallet',
        unitCode: 'PALLET-CONT-40HC-XUAT-KHAU-2026',
        unitName: 'Pallet gỗ thông 1200×1000 xếp container 40HC (xuất khẩu, đã hun trùng)',
        conversionRate: 123456789.123456,
        isBaseUnit: false,
      },
    ],
    columns: buildConversionUnitColumns(t, 'THUNG-24CHAI-500ML-PET-XK-202601'),
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

describe('buildConversionUnitColumns', () => {
  it('tỉ lệ dạng "1 G = 0,001 KG", dòng gốc có badge', () => {
    render(<Table />)
    // Tỉ lệ ở cột Tỉ lệ + dòng phụ khung hẹp (jsdom không chạy container query nên thấy cả hai).
    const rateCells = (text: string) =>
      screen.getAllByText(
        (_, el) => el?.tagName === 'SPAN' && el.children.length > 0 && el.textContent === text,
      )
    expect(rateCells('1 G = 0,001 KG')).toHaveLength(2)
    expect(rateCells('1 KG = 1 KG')).toHaveLength(2)
    expect(screen.getByText('Đơn vị gốc')).toBeInTheDocument()
  })

  it('dữ liệu xấu: tên đơn vị xuống dòng; số tỉ lệ không bị tách dòng; ô tỉ lệ được xuống dòng', () => {
    render(<LongTable />)
    expect(
      screen.getByText('Pallet gỗ thông 1200×1000 xếp container 40HC (xuất khẩu, đã hun trùng)'),
    ).toHaveClass('whitespace-normal', 'break-words')
    // Hai chỗ có tỉ lệ: cột Tỉ lệ (khung rộng) và dòng phụ dưới tên đơn vị (khung hẹp, `@sm:hidden`).
    const rates = screen.getAllByText('123.456.789,123456')
    expect(rates).toHaveLength(2)
    for (const rate of rates) expect(rate).toHaveClass('whitespace-nowrap', 'tabular-nums')
    expect(rates.some((r) => r.parentElement?.className.includes('@sm:hidden'))).toBe(true)
    // Tên không khoảng trắng trong hàng flex chỉ ngắt được khi có `min-w-0`.
    expect(
      screen.getByText('Pallet gỗ thông 1200×1000 xếp container 40HC (xuất khẩu, đã hun trùng)'),
    ).toHaveClass('min-w-0')
    const t = ((k: string) => k) as unknown as Parameters<typeof buildConversionUnitColumns>[0]
    expect(buildConversionUnitColumns(t, 'KG')[1].meta).toMatchObject({ hideBelow: '@sm' })
  })
})
